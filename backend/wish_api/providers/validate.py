import hashlib
import json
import re
from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, Field, ValidationError as PydanticError, conlist

from ..jsutil import utf16_len, utf16_slice
from ..vocab import Archetype, Domain, Focus, Format


class ValidationError(Exception):
    """The model answered but the output was off; the chain retries with this message as a hint."""


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


class RawResponse(BaseModel):
    moves: conlist(RawMove, min_length=3)


def issues(e: PydanticError) -> str:
    """First three problems as "path: message", like the zod messages the TS backend sent back as a retry hint."""
    return "; ".join(f"{'.'.join(str(p) for p in i['loc'])}: {i['msg']}" for i in e.errors()[:3])


def strip_fences(text: str) -> str:
    return re.sub(r"^```(?:json)?\s*|\s*```\Z", "", text)


def parse_model_json(text: str) -> list[RawMove]:
    try:
        data = json.loads(strip_fences(text))
    except ValueError:
        raise ValidationError("response was not valid JSON")
    try:
        return RawResponse.model_validate(data).moves
    except PydanticError as e:
        raise ValidationError(issues(e))


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
