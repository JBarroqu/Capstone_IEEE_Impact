"""Module 2: Wish & Next Move (owner Waleed). docs/modules/wish.md. The Wish Engine's flow, keyed by the signed-in user:
wish -> classify -> follow-up questions -> options (model-generated, D-29) -> select -> SelectedMove v0.1. A wish holds a
path of moves, generated one at a time (D-02); the next step opens per NEXT_MOVE_GATE (D-03); prompts see the profile (D-06) and earlier outcomes (D-07)."""
import logging
import time
from datetime import datetime, timezone

from sqlalchemy import and_, func, select, update
from sqlalchemy.dialects.postgresql import insert

from ... import db, policies
from ...contracts import DomainEvent, SelectedMove
from ...llm.chain import run_chain
from ...llm.errors import LlmUnavailable
from ...llm.run import LlmTask
from ...platform import bus
from .archetypes import quiz
from .engine.classify import classify_wish
from .movegen import chain_options
from .prompts.classify_v1 import CLASSIFY_VERSION, build_classify_prompt, classify_json_schema, parse_classify
from .prompts.questions_v1 import (QUESTIONS_TEMPERATURE, QUESTIONS_VERSION, build_questions_prompt, parse_questions,
                                   questions_json_schema)
from .tables import moves, selected_moves, wishes

log = logging.getLogger("impact.wish")
CLOSED = ("abandoned",)
WISH_COLS = {"text": "text", "fromChip": "from_chip", "type": "type", "focus": "focus", "domains": "domains",
             "guessedType": "guessed_type", "guessedFocus": "guessed_focus", "guessedDomains": "guessed_domains",
             "archetype": "archetype", "why": "why", "priorAttempts": "prior_attempts", "followUps": "follow_ups"}


class WishError(ValueError):
    def __init__(self, msg: str, status: int = 400):
        super().__init__(msg)
        self.status = status


def _profile():
    from ..profile import api
    return api


def _growth():
    from ..growth import api
    return api


# ---- wishes -----------------------------------------------------------------------------------------------------
async def upsert_wish(user_id: str, wish_id: str, fields: dict) -> None:
    """True upsert: the client fires partial updates that can arrive out of order (Wish Engine rule). A wish can only be
    changed by its owner."""
    rest = {WISH_COLS[k]: v for k, v in fields.items() if k in WISH_COLS}
    async with db.tx() as c:
        exists = (await c.execute(select(wishes.c.user_id).where(wishes.c.id == wish_id))).first()
        if exists and str(exists.user_id) != user_id:
            raise WishError("not found", 404)
        if not exists:
            cap = policies.get("MAX_ACTIVE_WISHES")
            if cap:
                n = (await c.execute(select(func.count()).select_from(wishes).where(
                    wishes.c.user_id == user_id, wishes.c.status == "active"))).scalar()
                if n >= cap:
                    raise WishError(f"You can have {cap} active wishes. Complete or close one first.", 409)
        stmt = insert(wishes).values(id=wish_id, user_id=user_id, **{**rest, "text": rest.get("text") or ""})
        stmt = stmt.on_conflict_do_update(index_elements=[wishes.c.id], set_={**rest, "updated_at": func.now()},
                                          where=wishes.c.user_id == user_id) if rest else stmt.on_conflict_do_nothing()
        await c.execute(stmt)


async def set_wish_status(user_id: str, wish_id: str, status: str) -> None:
    async with db.tx() as c:
        await c.execute(update(wishes).where(wishes.c.id == wish_id, wishes.c.user_id == user_id)
                        .values(status=status, updated_at=func.now()))


async def _wish(c, user_id: str, wish_id: str):
    w = (await c.execute(select(wishes).where(wishes.c.id == wish_id, wishes.c.user_id == user_id))).first()
    if not w:
        raise WishError("Wish not found.", 404)
    return w


async def list_wishes(user_id: str) -> list[dict]:
    async with db.read() as c:
        ws = (await c.execute(select(wishes).where(wishes.c.user_id == user_id).order_by(wishes.c.created_at.desc()))).all()
        sms = (await c.execute(select(selected_moves).where(selected_moves.c.user_id == user_id)
                               .order_by(selected_moves.c.step))).all()
    out = []
    for w in ws:
        mine = [s for s in sms if s.wish_id == w.id and s.status not in CLOSED]
        out.append({"id": str(w.id), "text": w.text, "status": w.status, "type": w.type, "focus": w.focus or [],
                    "domains": w.domains or [], "why": w.why, "priorAttempts": w.prior_attempts, "followUps": w.follow_ups,
                    "createdAt": w.created_at, "moves": [_sm_summary(s) for s in mine],
                    "nextStep": len(mine) + 1, "nextOpen": _gate_open(mine) and len(mine) < policies.get("MAX_STEPS_PER_WISH")})
    return out


async def get_wish(user_id: str, wish_id: str) -> dict:
    ws = [w for w in await list_wishes(user_id) if w["id"] == wish_id]
    if not ws:
        raise WishError("Wish not found.", 404)
    return ws[0]


def _sm_summary(s) -> dict:
    m = s.contract["move"]
    return {"selectedMoveId": str(s.id), "step": s.step, "status": s.status, "title": m["title"], "detail": m["detail"],
            "minutes": m["minutes"], "cost": m["cost"], "format": m["format"], "activityType": s.activity_type,
            "difficulty": s.difficulty, "skillId": s.skill_id, "selectedAt": s.selected_at}


# ---- gate (D-02, D-03) ------------------------------------------------------------------------------------------
GATE_STATUSES = {
    "validated": ("validated",),
    "ai_scored": ("awaiting_review", "validated", "needs_work"),
    "submitted": ("evidence_submitted", "awaiting_review", "validated", "needs_work"),
}


def _gate_open(open_moves: list) -> bool:
    """open_moves = selected (not abandoned) moves of one wish, by step."""
    if not open_moves:
        return True
    if policies.get("MOVES_PER_WISH") == 3 and len(open_moves) < 3:
        return True  # the 3-move path is picked up front
    gate = policies.get("NEXT_MOVE_GATE")
    if gate == "none":
        return True
    return open_moves[-1].status in GATE_STATUSES[gate]


async def next_step(c, user_id: str, wish_id: str) -> tuple[int, bool, list]:
    sms = (await c.execute(select(selected_moves).where(selected_moves.c.wish_id == wish_id,
                                                        selected_moves.c.status.not_in(CLOSED))
                           .order_by(selected_moves.c.step))).all()
    step = len(sms) + 1
    return step, _gate_open(sms) and step <= policies.get("MAX_STEPS_PER_WISH"), sms


# ---- classify and questions (Wish Engine, unchanged behaviour) ----------------------------------------------------
def _keywords(text: str) -> dict:
    g = classify_wish(text)
    return {"focus": g["focus"], "domains": g["domains"], "type": "fixed" if "goal" in g["focus"] else "open_ended"}


async def classify(text: str) -> dict:
    from ...config import config

    t0 = time.monotonic()
    try:
        r = await run_chain(LlmTask(schema=classify_json_schema, build=lambda h: build_classify_prompt(text, h), parse=parse_classify),
                            budget_ms=config.classify_budget_ms)
        return {**r.value, "source": "llm", "provider": r.backend.provider, "model": r.backend.model,
                "prompt_version": CLASSIFY_VERSION, "latency_ms": r.latency_ms, "tried": [f"{t['id']}:{t['reason']}" for t in r.tried]}
    except Exception as e:
        log.error("classify failed, using keywords: %s", e)
        return {**_keywords(text), "source": "keywords", "fail_reason": e.reason if isinstance(e, LlmUnavailable) else "error",
                "latency_ms": round((time.monotonic() - t0) * 1000)}


async def questions(ctx: dict) -> dict:
    from ...config import config

    t0 = time.monotonic()
    try:
        r = await run_chain(LlmTask(schema=questions_json_schema, temperature=QUESTIONS_TEMPERATURE,
                                    build=lambda h: build_questions_prompt(ctx, h), parse=parse_questions),
                            budget_ms=config.questions_budget_ms)
        return {"source": "llm", "questions": r.value, "provider": r.backend.provider, "model": r.backend.model,
                "promptVersion": QUESTIONS_VERSION, "latencyMs": r.latency_ms, "tried": [f"{t['id']}:{t['reason']}" for t in r.tried]}
    except Exception as e:
        log.error("questions failed, using the fixed quiz: %s", e)
        fixed = [{"id": q["id"], "prompt": q["prompt"], "note": "", "answers": [{"id": a["id"], "label": a["label"]} for a in q["answers"]]}
                 for q in quiz]
        return {"source": "fixed", "questions": fixed, "latencyMs": round((time.monotonic() - t0) * 1000),
                "failReason": e.reason if isinstance(e, LlmUnavailable) else "error"}


# ---- options ----------------------------------------------------------------------------------------------------
async def _prompt_profile(user_id: str) -> tuple[dict | None, list[dict], str | None, int]:
    state = await _profile().get_professional_state(user_id)
    g = _growth()
    career_name = g.career_name(state.targetCareerId)
    prof = _profile().to_prompt_profile(state, policies.get("PROFILE_IN_MOVES"), career_name)
    if prof is not None:
        growth = await g.get_growth_state(user_id)
        tiers = [f"{s.name} {s.tier}" for s in growth.skills if s.tier != "Not started"]
        if tiers:
            prof["tiers"] = tiers
    skills = await g.allowed_skills(user_id, state.targetCareerId, state.skills)
    return prof, skills, state.targetCareerId, state.version


async def options(user_id: str, wish_id: str, step: int, reroll_index: int, rejected_ids: list[str],
                  reject_reason: dict | None) -> dict:
    async with db.read() as c:
        w = await _wish(c, user_id, wish_id)
        open_step, is_open, sms = await next_step(c, user_id, wish_id)
        if step != open_step or not is_open:
            raise WishError("This step isn't open yet. Finish the previous move first.", 409)
        shown = (await c.execute(select(moves).where(moves.c.wish_id == wish_id, moves.c.step == step))).all()
    rejected = [r.payload for r in shown if str(r.id) in set(rejected_ids)]
    prof, skills, career_id, profile_version = await _prompt_profile(user_id)
    outcomes = []
    if policies.get("NEXT_MOVE_CONTEXT") == "outcomes" and sms:
        by_id = {str(s.id): s for s in sms}
        for o in await _growth().recent_outcomes(user_id, list(by_id)):
            s = by_id[o["selectedMoveId"]]
            outcomes.append({**o, "step": s.step, "title": s.contract["move"]["title"]})
    req = {
        "ctx": {"wishText": w.text, "type": w.type, "focus": w.focus or [], "domains": w.domains or [], "why": w.why,
                "prior": w.prior_attempts or {"chips": []}, "followUps": w.follow_ups, "archetype": w.archetype,
                "chosen": [s.contract["move"] for s in sms]},
        "step": step, "profile": prof, "skills": skills, "outcomes": outcomes,
        "rejectedMoves": rejected or None, "rejectReason": reject_reason,
        "excludeTitles": [r.payload["title"] for r in shown] or None,
    }
    result = await chain_options(req)
    rows = []
    async with db.tx() as c:
        for i, m in enumerate(result["moves"]):
            payload = {**m, "key": m["id"], "careerId": career_id}
            mid = (await c.execute(moves.insert().values(
                user_id=user_id, wish_id=wish_id, move_key=m["id"], step=step, position=i, reroll_index=reroll_index,
                payload=payload, provider=result["meta"]["usedProvider"], model=result["meta"].get("model"),
                prompt_version=result["meta"].get("promptVersion"), latency_ms=result["meta"].get("latencyMs"),
            ).returning(moves.c.id))).scalar_one()
            rows.append({**payload, "id": str(mid)})
        await c.execute(update(wishes).where(wishes.c.id == wish_id).values(profile_version=profile_version))
    return {"moves": rows, "meta": result["meta"], "skills": skills}


async def select_move(user_id: str, wish_id: str, move_id: str, selection: dict) -> SelectedMove:
    async with db.tx() as c:
        w = await _wish(c, user_id, wish_id)
        open_step, is_open, sms = await next_step(c, user_id, wish_id)
        m = (await c.execute(select(moves).where(moves.c.id == move_id, moves.c.wish_id == wish_id))).first()
        if not m:
            raise WishError("Option not found.", 404)
        if m.step != open_step or not is_open:
            raise WishError("This step isn't open.", 409)
        now = datetime.now(timezone.utc)
        payload = {**m.payload, "id": str(m.id)}
        contract = {
            "schemaVersion": "0.1", "userId": user_id, "wishId": wish_id, "selectedAt": now.isoformat(), "status": "active",
            "profileVersion": w.profile_version,
            "wish": {"text": w.text, "type": w.type, "focus": w.focus or [], "domains": w.domains or [], "why": w.why,
                     "priorAttempts": w.prior_attempts or {"chips": []},
                     "followUps": [{k: f.get(k) for k in ("question", "answer", "note")} for f in (w.follow_ups or [])]},
            "move": {k: payload.get(k) for k in ("id", "key", "title", "detail", "step", "minutes", "cost", "format", "focus",
                                                 "domains", "archetypeFit", "activityType", "difficulty", "skillId", "careerId")},
            "selection": {"step": m.step, "position": m.position, "rerollIndex": m.reroll_index,
                          "msSinceShown": selection.get("msSinceShown"), "shownMoveIds": selection.get("shownMoveIds") or [],
                          "rejectedBefore": selection.get("rejectedBefore") or []},
            "provenance": {"provider": m.provider, "model": m.model, "promptVersion": m.prompt_version, "latencyMs": m.latency_ms,
                           "tried": selection.get("tried") or []},
        }
        sid = (await c.execute(selected_moves.insert().values(
            user_id=user_id, wish_id=wish_id, move_id=move_id, step=m.step, contract=contract, skill_id=payload.get("skillId"),
            activity_type=payload.get("activityType"), difficulty=payload.get("difficulty"), selected_at=now,
        ).returning(selected_moves.c.id))).scalar_one()
        await c.execute(update(wishes).where(wishes.c.id == wish_id).values(current_step=m.step + 1, updated_at=func.now()))
        bus.publish(DomainEvent(name="MoveSelected", userId=user_id,
                                refs={"wishId": wish_id, "selectedMoveId": str(sid), "title": payload["title"], "step": m.step}))
    return await get_selected_move(str(sid))


async def get_selected_move(selected_move_id: str) -> SelectedMove | None:
    async with db.read() as c:
        s = (await c.execute(select(selected_moves).where(selected_moves.c.id == selected_move_id))).first()
    if not s:
        return None
    return SelectedMove.model_validate({**s.contract, "selectedMoveId": str(s.id), "status": s.status})


async def set_status(selected_move_id: str, status: str) -> None:
    async with db.tx() as c:
        await c.execute(update(selected_moves).where(selected_moves.c.id == selected_move_id).values(
            status=status, closed_at=func.now() if status in ("validated", "abandoned") else None))


async def abandon(user_id: str, selected_move_id: str) -> None:
    async with db.tx() as c:
        s = (await c.execute(select(selected_moves).where(selected_moves.c.id == selected_move_id,
                                                          selected_moves.c.user_id == user_id))).first()
        if not s:
            raise WishError("not found", 404)
        if s.status == "validated":
            raise WishError("A validated move can't be abandoned.", 409)
        await c.execute(update(selected_moves).where(selected_moves.c.id == selected_move_id)
                        .values(status="abandoned", closed_at=func.now()))
        await c.execute(update(wishes).where(wishes.c.id == s.wish_id).values(current_step=s.step))


async def list_selected(user_id: str, status: str | None = None) -> list[dict]:
    q = select(selected_moves, wishes.c.text.label("wish_text")).join(wishes, wishes.c.id == selected_moves.c.wish_id) \
        .where(selected_moves.c.user_id == user_id)
    if status:
        q = q.where(selected_moves.c.status.in_(status.split(",")))
    async with db.read() as c:
        rows = (await c.execute(q.order_by(selected_moves.c.selected_at.desc()))).all()
    return [{**_sm_summary(r), "wishId": str(r.wish_id), "wishText": r.wish_text} for r in rows]


async def maybe_next_move_ready(event: DomainEvent) -> None:
    """Subscriber: after growth changes a move's state, announce when the wish's next step opens (D-03)."""
    sm_id = event.refs.get("selectedMoveId")
    if not sm_id:
        return
    async with db.read() as c:
        s = (await c.execute(select(selected_moves.c.wish_id, selected_moves.c.user_id).where(selected_moves.c.id == sm_id))).first()
        if not s:
            return
        w = (await c.execute(select(wishes.c.text, wishes.c.status).where(wishes.c.id == s.wish_id))).first()
        step, is_open, sms = await next_step(c, str(s.user_id), str(s.wish_id))
    if w.status == "active" and is_open and sms:
        await bus.publish_now(DomainEvent(name="NextMoveReady", userId=str(s.user_id),
                                          refs={"wishId": str(s.wish_id), "step": step, "wishText": w.text}))
