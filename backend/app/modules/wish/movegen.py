"""Turning model output into clean moves (from the Wish Engine's validate.py and llm.py): parse, dedupe against what
was already shown, at most one paid move, retry with a hint when fewer than 3 usable remain. Every move is generated
(D-29): there is no fallback set."""
import hashlib
import re
from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, Field, ValidationError as PydanticError, conlist

from ...config import config
from ...llm.chain import run_chain
from ...llm.run import LlmTask
from ...llm.validate import ValidationError, issues, load_json
from ...platform.jsutil import utf16_len, utf16_slice
from .prompts.moves_v5 import MOVES_TEMPERATURE, PROMPT_VERSION, build_prompt, moves_json_schema
from .vocab import Archetype, Domain, Focus, Format


def _strict_number(v: Any) -> Any:
    # JSON numbers only (no "30" strings), like zod.
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ValueError("Invalid input: expected number")
    return v


def _int(v: Any) -> int:
    v = _strict_number(v)
    if isinstance(v, float) and not v.is_integer():
        raise ValueError("Invalid input: expected int, received number")
    return int(v)


JsInt = Annotated[int, BeforeValidator(_int)]
JsNum = Annotated[float, BeforeValidator(_strict_number)]


class RawMove(BaseModel):
    title: str = Field(min_length=1)
    detail: str = Field(min_length=1)
    step: Annotated[JsInt, Field(ge=1, le=5)]
    focus: conlist(Focus, min_length=1)
    domains: conlist(Domain, min_length=1)
    minutes: Annotated[JsInt, Field(ge=1, le=100000)]
    cost: Literal["free", "paid"]
    format: Format
    archetypeFit: dict[Archetype, Annotated[JsNum, Field(ge=0, le=1)]] | None = None
    activityType: Literal["explore", "create", "test", "share", "connect", "enable"]
    difficulty: Literal["easy", "moderate", "hard"]
    skillId: str = Field(min_length=1, max_length=40)


class RawResponse(BaseModel):
    moves: conlist(RawMove, min_length=3)


def parse_model_json(text: str, skill_ids: list[str] | None = None) -> list[RawMove]:
    data = load_json(text)
    try:
        moves = RawResponse.model_validate(data).moves
    except PydanticError as e:
        raise ValidationError(issues(e))
    if skill_ids:
        bad = [m.skillId for m in moves if m.skillId not in skill_ids]
        if bad:
            raise ValidationError(f"skillId must be one of {skill_ids}; got {bad}")
    return moves


def normalize_title(t: str) -> str:
    """Lowercase, letters/digits/spaces only: two titles that differ only in punctuation or case count as the same move."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", "", t.lower())).strip()


def gen_id(title: str, step: int) -> str:
    return "gen-" + hashlib.sha1(f"{normalize_title(title)}|{step}".encode()).hexdigest()[:10]


def _truncate(s: str, n: int) -> str:
    return s if utf16_len(s) <= n else utf16_slice(s, n - 1).rstrip() + "…"


def _one_sentence(s: str) -> str:
    m = re.match(r"^.*?[.!?](?=\s|\Z)", s.strip())
    return m.group(0) if m else s.strip()


def to_move(raw: RawMove, step: int) -> dict:
    title = _truncate(raw.title.strip(), 60)
    return {
        "id": gen_id(title, step), "title": title, "detail": _one_sentence(raw.detail), "step": step,
        "focus": list(raw.focus), "domains": list(raw.domains), "minutes": raw.minutes, "cost": raw.cost,
        "format": raw.format, "archetypeFit": dict(raw.archetypeFit or {}),
        "activityType": raw.activityType, "difficulty": raw.difficulty, "skillId": raw.skillId,
    }


def repair_moves(raws: list[RawMove], step: int, seen_titles: set[str]) -> tuple[list[dict], bool]:
    """Turn raw model output into up to 3 clean moves: dedupe against `seen_titles`, cap paid at 1.
    The caller asks the model again if fewer than 3 or fewer than 2 free remain. Returns whether any repair happened."""
    repaired = False
    out: list[dict] = []
    local = set(seen_titles)
    for raw in raws:
        m = to_move(raw, step)
        key = normalize_title(m["title"])
        if key in local:
            repaired = True
            continue
        local.add(key)
        out.append(m)
    if len(out) != len(raws):
        repaired = True
    # enforce <=1 paid: keep the first paid (model's own ordering as proxy for best-scored)
    kept, paid_seen = [], False
    for m in out:
        if m["cost"] == "paid":
            if paid_seen:
                repaired = True
                continue
            paid_seen = True
        kept.append(m)
    return kept, repaired


def assemble(req: dict, raws) -> tuple[list[dict], bool]:
    """Clean up model output. Raises ValidationError (-> retry with the message as a hint) if it can't make 3 valid moves."""
    seen = {normalize_title(t) for t in req.get("excludeTitles") or []}
    seen |= {normalize_title(m["title"]) for m in req.get("rejectedMoves") or []}
    seen |= {normalize_title(m["title"]) for m in req["ctx"]["chosen"]}
    out, did_repair = repair_moves(raws, req["step"], seen)
    if (req.get("rejectReason") or {}).get("chip") == "don't want to pay":
        free = [m for m in out if m["cost"] == "free"]
        if len(free) != len(out):
            did_repair = True
        out = free
    if len(out) > 3:
        out, did_repair = out[:3], True
    n_free = len([m for m in out if m["cost"] == "free"])
    if len(out) < 3 or n_free < 2:
        raise ValidationError(
            f"need exactly 3 distinct moves (not repeating earlier ones), at least 2 free and at most 1 paid; got {len(out)} usable ({n_free} free)"
        )
    return out, did_repair


async def chain_options(req: dict, **chain_opts) -> dict:
    """Moves from the model chain. Every option is generated; if the chain fails, LlmUnavailable reaches the student as a retry."""
    skill_ids = [s["id"] for s in req.get("skills") or []]
    task = LlmTask(schema=moves_json_schema(skill_ids), temperature=MOVES_TEMPERATURE,
                   build=lambda hint: build_prompt(req, hint),
                   parse=lambda text: assemble(req, parse_model_json(text, skill_ids)))
    r = await run_chain(task, **chain_opts)
    moves, repaired = r.value
    return {
        "moves": moves,
        "meta": {
            "requestedProvider": config.provider, "usedProvider": r.backend.provider, "model": r.backend.model,
            "promptVersion": PROMPT_VERSION, "latencyMs": r.latency_ms, "cacheHit": False, "repaired": r.repaired or repaired,
            "relaxed": False, "sources": ["generated"] * len(moves), "tried": [f"{t['id']}:{t['reason']}" for t in r.tried],
        },
    }
