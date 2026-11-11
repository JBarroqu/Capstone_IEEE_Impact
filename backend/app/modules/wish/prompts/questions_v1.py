import json

from pydantic import BaseModel, Field, ValidationError as PydanticError, conlist, field_validator

from ....platform.jsutil import js_json
from ....llm.validate import ValidationError, issues, strip_fences
from .text import QUESTIONS_SYSTEM

# Bump on any edit to the prompt or schema.
QUESTIONS_VERSION = "questions.v1"
QUESTIONS_TEMPERATURE = 0.7

questions_json_schema = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array", "minItems": 3, "maxItems": 3,
            "items": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string"},
                    "answers": {"type": "array", "minItems": 3, "maxItems": 4, "items": {"type": "string"}},
                    "note": {"type": "string"},
                },
                "required": ["prompt", "answers", "note"],
            },
        }
    },
    "required": ["questions"],
}


def build_questions_prompt(ctx: dict, hint: str | None = None) -> dict:
    prior = ctx.get("prior") or {"chips": []}
    tried = "; ".join(x for x in [*prior["chips"], prior.get("text")] if x)
    lines = [
        f"Wish: {js_json(ctx['wishText'])}",
        f"Type: {ctx['type']}. Focus: {', '.join(ctx['focus']) or 'unknown'}. Domain: {', '.join(ctx['domains']) or 'unknown'}.",
        f"Why they want it: {js_json(ctx['why'])}" if ctx.get("why") else "Why: not given.",
        f"Already tried and didn't like: {tried}" if prior["chips"] or prior.get("text") else "Already tried: not given.",
    ]
    if hint:
        lines.append(f"Your previous answer was rejected: {hint}. Fix it.")
    return {"system": QUESTIONS_SYSTEM, "user": "\n".join(lines)}


class _Q(BaseModel):
    prompt: str = Field(min_length=5, max_length=140)
    answers: conlist(str, min_length=3, max_length=4)
    note: str = Field(default="", max_length=200)

    @field_validator("prompt", "note", mode="before")
    @classmethod
    def _trim(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("answers", mode="before")
    @classmethod
    def _trim_answers(cls, v):
        if isinstance(v, list):
            v = [a.strip() if isinstance(a, str) else a for a in v]
            for a in v:
                if isinstance(a, str) and not 1 <= len(a) <= 60:
                    raise ValueError("answers must be 1 to 60 characters")
        return v


class _Schema(BaseModel):
    questions: conlist(_Q, min_length=3)


def parse_questions(text: str) -> list[dict]:
    """Raises ValidationError so the chain retries with the problem as a hint. Ids are positional (g1..g3, a..d)."""
    try:
        data = json.loads(strip_fences(text))
    except ValueError:
        raise ValidationError("response was not valid JSON") from None
    try:
        qs = _Schema.model_validate(data).questions[:3]
    except PydanticError as e:
        raise ValidationError(issues(e)) from e
    for q in qs:
        if len({a.lower() for a in q.answers}) != len(q.answers):
            raise ValidationError(f'question "{q.prompt}" has duplicate answers')
    return [
        {"id": f"g{i + 1}", "prompt": q.prompt, "note": q.note, "answers": [{"id": "abcd"[j], "label": a} for j, a in enumerate(q.answers)]}
        for i, q in enumerate(qs)
    ]
