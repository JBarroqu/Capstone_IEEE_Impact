"""Moves prompt. Bump PROMPT_VERSION on any edit to the text or schema (the analytics compare versions)."""
from ..vocab import ARCHETYPES, DOMAINS, FOCUSES, FORMATS
from .text import MOVES_SYSTEM, STYLE_EXAMPLE

PROMPT_VERSION = "moves.v4"

# Moves should vary between students with the same wish; classification keeps the backend default.
MOVES_TEMPERATURE = 0.8

# JSON schema for one move (no id). Shared by Ollama `format` and Gemini `response_format`.
moves_json_schema = {
    "type": "object",
    "properties": {
        "moves": {
            "type": "array",
            "minItems": 3,
            "maxItems": 3,
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "detail": {"type": "string"},
                    "step": {"type": "integer", "minimum": 1, "maximum": 5},
                    "focus": {"type": "array", "items": {"type": "string", "enum": list(FOCUSES)}},
                    "domains": {"type": "array", "items": {"type": "string", "enum": list(DOMAINS)}},
                    "minutes": {"type": "integer"},
                    "cost": {"type": "string", "enum": ["free", "paid"]},
                    "format": {"type": "string", "enum": list(FORMATS)},
                    "archetypeFit": {"type": "object", "properties": {a: {"type": "number"} for a in ARCHETYPES}},
                },
                "required": ["title", "detail", "step", "focus", "domains", "minutes", "cost", "format"],
            },
        }
    },
    "required": ["moves"],
}

REJECT_HINTS = {
    "too big": "make the new options smaller and quicker",
    "too small": "make the new options bigger and more ambitious",
    "not my style": "change the format and approach entirely",
    "already done this": "avoid anything that repeats what they have already done",
    "don't want to pay": "make ALL three options free",
}


def _fmt(m: dict) -> str:
    return f"{m['title']} — {m['detail']} ({m['minutes']} min, {m['cost']})"


def build_prompt(req: dict, error_hint: str | None = None) -> dict:
    """`req` is the options request as a dict (absent optional fields are None)."""
    ctx, step = req["ctx"], req["step"]
    lines = [
        f'Wish: "{ctx["wishText"]}"',
        f"Type: {ctx['type']}. Focus: {', '.join(ctx['focus']) or 'unknown'}. Domain: {', '.join(ctx['domains']) or 'unknown'}.",
    ]
    if ctx.get("why"):
        lines.append(f'Why they want it: "{ctx["why"]}"')
    prior = ctx["prior"]
    if prior["chips"] or prior.get("text"):
        tried = "; ".join(x for x in [*prior["chips"], prior.get("text")] if x)
        lines.append(f"Already tried and didn't like: {tried}. Rank these formats lower and avoid repeating them.")
    if ctx.get("followUps"):
        answers = "\n".join(f"- {f['question']} → {f['answer']}" for f in ctx["followUps"])
        lines.append(f"Their answers to follow-up questions (use these to fit the moves to their situation):\n{answers}")
    if ctx.get("archetype"):
        lines.append(f"Archetype (affects ranking only): {ctx['archetype']}.")
    if ctx["chosen"]:
        locked = "\n".join(f"{i + 1}. {_fmt(m)}" for i, m in enumerate(ctx["chosen"]))
        lines.append(f"Moves already locked in:\n{locked}")
    lines.append(f'Now write the options for move {step}. Set "step" to {step} on every move.')
    # `is not None`: an empty reject reason object still counts, as it did in JS ({} is truthy).
    if req.get("rejectedMoves") or req.get("rejectReason") is not None:
        reason = req.get("rejectReason") or {}
        hint = REJECT_HINTS.get(reason["chip"]) if reason.get("chip") else None
        rejected = "\n".join(f"- {m['title']}" for m in req.get("rejectedMoves") or [])
        why = " — ".join(x for x in [reason.get("chip"), reason.get("text")] if x) or "not given"
        lines.append(
            f"The student rejected these options for this step:\n{rejected}\nReason: {why}.{f' So: {hint}.' if hint else ''} "
            "Do not repeat or lightly reword them."
        )
    if req.get("excludeTitles"):
        lines.append(f"Already shown to the student for this step, do not repeat or lightly reword: {'; '.join(req['excludeTitles'])}")
    if error_hint:
        lines.append(f"Your previous answer was invalid: {error_hint}. Fix it and answer again.")
    return {"system": MOVES_SYSTEM, "user": f"{STYLE_EXAMPLE}\n\n" + "\n".join(lines)}
