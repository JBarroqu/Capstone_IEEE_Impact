import logging
from typing import Annotated

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, conlist
from sqlalchemy import and_
from sqlalchemy.dialects.postgresql import insert

from .. import db
from ..archetypes import quiz
from ..config import CONSENT_INTRO, CONSENT_LOCAL, config, consent_remote
from ..engine.classify import classify_wish
from ..events_schema import EventBatch
from ..prompts.classify_v1 import CLASSIFY_VERSION, build_classify_prompt, classify_json_schema, parse_classify
from ..prompts.questions_v1 import QUESTIONS_TEMPERATURE, QUESTIONS_VERSION, build_questions_prompt, parse_questions, questions_json_schema
from ..providers.backends import remote_services
from ..providers.errors import LlmUnavailable
from ..providers.llm import run_chain
from ..providers.options import get_options
from ..providers.run import LlmTask
from ..rate_limit import limited, rules
from ..security import client_ip, current_session, issue_session
from ..vocab import Archetype, Domain, Focus, Format
from .common import UUID_RE, ok, parse, read_json

log = logging.getLogger("wish_api")
router = APIRouter(prefix="/api")

Uuid = Field(pattern=UUID_RE)


class Prior(BaseModel):
    chips: conlist(Annotated[str, Field(max_length=40)], max_length=10)
    text: str | None = Field(default=None, max_length=1000)


class FollowUp(BaseModel):
    question: str = Field(max_length=200)
    answer: str = Field(max_length=80)
    note: str | None = Field(default=None, max_length=200)


@router.get("/config")
async def get_config():
    """What the pages need from the server: flow length and the consent text (which names the outside services)."""
    remote = remote_services()
    return {"flowMoves": config.flow_moves, "consent": {"intro": CONSENT_INTRO, "data": consent_remote(remote) if remote else CONSENT_LOCAL}}


NO_SESSION = lambda: JSONResponse({"ok": False, "reason": "no_session"}, status_code=401)  # noqa: E731


class SessionBody(BaseModel):
    sessionId: str = Uuid
    participantCode: str = Field(min_length=1, max_length=64)
    consented: bool


@router.post("/session")
async def session(req: Request):
    """Called only after consent. Creates the session row and the signed cookie the other routes check."""
    if rl := limited((rules.session_ip, client_ip(req)), (rules.session_all, "all")):
        return rl
    p = parse(SessionBody, await read_json(req, 1024))
    if isinstance(p, JSONResponse) or not p.consented or not p.participantCode.strip():
        return JSONResponse({"ok": False}, status_code=400)
    try:
        async with db.engine().begin() as c:
            await c.execute(insert(db.sessions).values(
                id=p.sessionId, participant_code=p.participantCode, provider=config.provider, app_version=config.app_version, consented=True,
            ).on_conflict_do_nothing())
    except Exception:
        log.exception("session insert failed")
        return JSONResponse({"ok": False, "reason": "db"}, status_code=503)
    res = JSONResponse(ok(provider=config.provider))
    await issue_session(res, req, p.sessionId)
    return res


class WishBody(BaseModel):
    id: str = Uuid
    sessionId: str = Uuid
    text: str | None = Field(default=None, min_length=1, max_length=500)
    fromChip: bool | None = None
    type: str | None = Field(default=None, pattern=r"^(open_ended|fixed)$")
    focus: conlist(Focus, max_length=10) | None = None
    domains: conlist(Domain, max_length=10) | None = None
    guessedFocus: conlist(Focus, max_length=10) | None = None
    guessedDomains: conlist(Domain, max_length=10) | None = None
    archetype: Archetype | None = None
    why: str | None = Field(default=None, max_length=1000)
    priorAttempts: Prior | None = None
    followUps: conlist(FollowUp, max_length=5) | None = None


WISH_COLS = {"text": "text", "fromChip": "from_chip", "type": "type", "focus": "focus", "domains": "domains", "guessedFocus": "guessed_focus",
             "guessedDomains": "guessed_domains", "archetype": "archetype", "why": "why", "priorAttempts": "prior_attempts", "followUps": "follow_ups"}


@router.post("/wish")
async def wish(req: Request):
    """Upsert a wish; later screens send partial updates for the same id."""
    if rl := limited((rules.write_ip, client_ip(req))):
        return rl
    p = parse(WishBody, await read_json(req, 8192))
    if isinstance(p, JSONResponse):
        return p
    if await current_session(req) != p.sessionId:
        return NO_SESSION()
    # Only the fields the client sent, like the zod-parsed object did.
    rest = {WISH_COLS[k]: v for k, v in p.model_dump(exclude_unset=True, exclude={"id", "sessionId"}).items()}
    try:
        # True upsert: client updates for one wish can arrive out of order, so insert-or-update in one statement.
        stmt = insert(db.wishes).values(id=p.id, session_id=p.sessionId, **{**rest, "text": rest.get("text") or ""})
        # where: an existing wish can only be changed by the session that created it.
        stmt = (stmt.on_conflict_do_update(index_elements=[db.wishes.c.id], set_=rest, where=and_(db.wishes.c.session_id == p.sessionId))
                if rest else stmt.on_conflict_do_nothing())
        async with db.engine().begin() as c:
            await c.execute(stmt)
    except Exception:
        log.exception("wish upsert failed")
        return JSONResponse({"ok": False, "reason": "db"}, status_code=503)
    return ok()


class ClassifyBody(BaseModel):
    wishText: str = Field(min_length=1, max_length=500)


def _keywords(text: str) -> dict:
    g = classify_wish(text)
    return {"focus": g["focus"], "domains": g["domains"], "type": "fixed" if "goal" in g["focus"] else "open_ended"}


@router.post("/classify")
async def classify(req: Request):
    """Categorize a wish with the model chain. Classification only steers the moves, so if every model fails the
    keyword classifier answers instead (source: "keywords") rather than blocking the student."""
    import time

    if rl := limited((rules.classify_ip, client_ip(req))):
        return rl
    p = parse(ClassifyBody, await read_json(req, 4096))
    if isinstance(p, JSONResponse):
        return p
    session = await current_session(req)
    if not session:
        return NO_SESSION()
    # Classification shares the per-session model budget with options.
    if rl := limited((rules.options_session, session), (rules.classify_all, "all")):
        return rl
    t0 = time.monotonic()
    try:
        r = await run_chain(LlmTask(schema=classify_json_schema, build=lambda h: build_classify_prompt(p.wishText, h), parse=parse_classify),
                            budget_ms=config.classify_budget_ms)
        return ok(**r.value, source="llm", provider=r.backend.provider, model=r.backend.model, prompt_version=CLASSIFY_VERSION,
                  latency_ms=r.latency_ms, tried=[f"{t['id']}:{t['reason']}" for t in r.tried])
    except Exception as e:
        log.error("classify failed, using keywords: %s", e)
        return ok(**_keywords(p.wishText), source="keywords", fail_reason=e.reason if isinstance(e, LlmUnavailable) else "error",
                  latency_ms=round((time.monotonic() - t0) * 1000))


class QuestionsBody(BaseModel):
    wishText: str = Field(min_length=1, max_length=500)
    type: str = Field(pattern=r"^(open_ended|fixed)$")
    focus: conlist(Focus, max_length=10)
    domains: conlist(Domain, max_length=10)
    why: str | None = Field(default=None, max_length=1000)
    prior: Prior = Field(default_factory=lambda: Prior(chips=[]))


@router.post("/questions")
async def questions(req: Request):
    """Three follow-up questions written for this wish (stateless: the prompt carries everything, see
    docs/wish-engine/GEMINI-INTERACTIONS.md). If every model fails, the fixed placeholder quiz answers instead (source: "fixed"),
    like classification falls back to keywords; it only steers the moves, so it never blocks the student."""
    import time

    if rl := limited((rules.classify_ip, client_ip(req))):
        return rl
    p = parse(QuestionsBody, await read_json(req, 8192))
    if isinstance(p, JSONResponse):
        return p
    session = await current_session(req)
    if not session:
        return NO_SESSION()
    if rl := limited((rules.options_session, session), (rules.questions_all, "all")):
        return rl
    ctx = p.model_dump()
    t0 = time.monotonic()
    try:
        r = await run_chain(LlmTask(schema=questions_json_schema, temperature=QUESTIONS_TEMPERATURE,
                                    build=lambda h: build_questions_prompt(ctx, h), parse=parse_questions),
                            budget_ms=config.questions_budget_ms)
        return ok(source="llm", questions=r.value, provider=r.backend.provider, model=r.backend.model, promptVersion=QUESTIONS_VERSION,
                  latencyMs=r.latency_ms, tried=[f"{t['id']}:{t['reason']}" for t in r.tried])
    except Exception as e:
        log.error("questions failed, using the fixed quiz: %s", e)
        fixed = [{"id": q["id"], "prompt": q["prompt"], "note": "", "answers": [{"id": a["id"], "label": a["label"]} for a in q["answers"]]} for q in quiz]
        return ok(source="fixed", questions=fixed, latencyMs=round((time.monotonic() - t0) * 1000),
                  failReason=e.reason if isinstance(e, LlmUnavailable) else "error")


# Moves come back from the client (chosen, rejected), so every field is capped: they end up in the prompt.
class MoveIn(BaseModel):
    id: str = Field(max_length=80)
    title: str = Field(max_length=200)
    detail: str = Field(max_length=600)
    step: int = Field(ge=1, le=5)
    focus: conlist(Focus, max_length=10)
    domains: conlist(Domain, max_length=10)
    minutes: float = Field(ge=0, le=10_000)
    cost: str = Field(pattern=r"^(free|paid)$")
    format: Format
    archetypeFit: dict[str, float] = Field(default_factory=dict)
    tier: float | None = None
    requires: conlist(str, max_length=10) | None = None


class RejectReason(BaseModel):
    chip: str | None = Field(default=None, max_length=60)
    text: str | None = Field(default=None, max_length=500)


class Ctx(BaseModel):
    wishText: str = Field(max_length=500)
    type: str = Field(pattern=r"^(open_ended|fixed)$")
    focus: conlist(Focus, max_length=10)
    domains: conlist(Domain, max_length=10)
    why: str | None = Field(default=None, max_length=1000)
    prior: Prior = Field(default_factory=lambda: Prior(chips=[]))
    archetype: Archetype | None = None
    followUps: conlist(FollowUp, max_length=5) | None = None
    chosen: conlist(MoveIn, max_length=5) = Field(default_factory=list)


class OptionsBody(BaseModel):
    sessionId: str | None = Field(default=None, pattern=UUID_RE)
    wishId: str | None = Field(default=None, pattern=UUID_RE)
    step: int = Field(ge=1, le=5)
    rerollIndex: int = Field(default=0, ge=0)
    excludeIds: conlist(str, max_length=100) = Field(default_factory=list)
    excludeTitles: conlist(str, max_length=30) | None = None
    rejectReason: RejectReason | None = None
    rejectedMoves: conlist(MoveIn, max_length=3) | None = None
    ctx: Ctx


@router.post("/options")
async def options(req: Request):
    if rl := limited((rules.options_ip, client_ip(req))):
        return rl
    p = parse(OptionsBody, await read_json(req, 32_768))
    if isinstance(p, JSONResponse):
        return p
    # Model calls only for a session that went through consent; the session comes from the signed cookie, not the body.
    session = await current_session(req)
    if not session or (p.sessionId and p.sessionId != session):
        return NO_SESSION()
    if rl := limited((rules.options_session, session), (rules.options_all, "all")):
        return rl
    try:
        result = await get_options(_js_numbers({**p.model_dump(), "sessionId": session}))
        return ok(**result)
    except Exception as e:
        log.error("options failed: %s", e)
        return JSONResponse({"ok": False, "reason": e.reason if isinstance(e, LlmUnavailable) else "error"}, status_code=503)


def _js_numbers(v):
    """Integral floats back to ints (JS has one number type, so 30.0 printed as 30 in the prompt)."""
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, dict):
        return {k: _js_numbers(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_js_numbers(x) for x in v]
    return v


@router.post("/events")
async def events(req: Request):
    """Batches from lib/track.ts (sent as text/plain so cross-origin beacons work). Event ids come from the client,
    so a retried batch is not stored twice."""
    if rl := limited((rules.events_ip, client_ip(req))):
        return rl
    # 64 KB is far above a real batch (100 events of a few hundred bytes).
    data = await read_json(req, 65_536)
    if data is None:
        return JSONResponse({"ok": False}, status_code=400)
    p = parse(EventBatch, data)
    if isinstance(p, JSONResponse):
        return p
    session = await current_session(req)
    if not session or any(e.sessionId != session for e in p.events):
        return NO_SESSION()
    if rl := limited((rules.events_session, session)):
        return rl
    rows = []
    for e in p.events:
        row = {
            "client_ts": e.clientTs, "session_id": e.sessionId, "wish_id": e.wishId, "participant_code": e.participantCode,
            "app_version": config.app_version,
            "provider": e.payload["used_provider"] if isinstance(e.payload.get("used_provider"), str) else config.provider,
            "name": e.name, "step": e.step, "payload": e.payload,
        }
        if e.id:
            row["id"] = e.id
        rows.append(row)
    try:
        if rows:
            async with db.engine().begin() as c:
                # Rows with and without a client id have different column sets; insert each kind separately.
                for group in ([r for r in rows if "id" in r], [r for r in rows if "id" not in r]):
                    if group:
                        await c.execute(insert(db.events).values(group).on_conflict_do_nothing())
    except Exception:
        log.exception("events insert failed")
        return JSONResponse({"ok": False}, status_code=500)
    return ok()
