import json

from pydantic import BaseModel, ValidationError as PydanticError, conlist

from ....platform.jsutil import js_json
from ....llm.validate import ValidationError, issues, strip_fences
from ..vocab import DOMAINS, FOCUSES, Domain, Focus, WishType
from .text import CLASSIFY_SYSTEM

# Bump on any edit to the prompt or schema.
CLASSIFY_VERSION = "classify.v1"

classify_json_schema = {
    "type": "object",
    "properties": {
        "focus": {"type": "array", "minItems": 1, "maxItems": 2, "items": {"type": "string", "enum": list(FOCUSES)}},
        "domains": {"type": "array", "minItems": 1, "maxItems": 2, "items": {"type": "string", "enum": list(DOMAINS)}},
        "type": {"type": "string", "enum": ["fixed", "open_ended"]},
    },
    "required": ["focus", "domains", "type"],
}


def build_classify_prompt(wish_text: str, hint: str | None = None) -> dict:
    user = f"Wish: {js_json(wish_text)}" + (f"\n\nYour previous answer was rejected: {hint}. Fix it." if hint else "")
    return {"system": CLASSIFY_SYSTEM, "user": user}


class _Schema(BaseModel):
    focus: conlist(Focus, min_length=1)
    domains: conlist(Domain, min_length=1)
    type: WishType


def _uniq(a: list) -> list:
    return list(dict.fromkeys(a))[:2]


def parse_classify(text: str) -> dict:
    """Raises ValidationError so the chain retries with the problem as a hint."""
    try:
        data = json.loads(strip_fences(text))
    except ValueError:
        raise ValidationError("response was not valid JSON")
    try:
        r = _Schema.model_validate(data)
    except PydanticError as e:
        raise ValidationError(issues(e))
    return {"focus": _uniq(r.focus), "domains": _uniq(r.domains), "type": r.type}
