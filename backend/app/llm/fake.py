"""Test-only model (TESTING.md). Loaded only when ENV=test and LLM_FAKE=1 (config.llm_fake), so the rule that every
move is model-generated (D-29) holds everywhere else. It answers any task by reading the JSON schema it was given,
so it needs no knowledge of the prompts."""
import hashlib
import json
import re

from ..config import config
from .backends import Backend


def _pick(enum: list, seed: int):
    return enum[seed % len(enum)]


def _fill(schema: dict, seed: int, path: str = ""):
    t = schema.get("type")
    if "enum" in schema:
        return _pick(schema["enum"], seed)
    if t == "object":
        props = schema.get("properties", {})
        return {k: _fill(v, seed + i, f"{path}.{k}") for i, (k, v) in enumerate(props.items())}
    if t == "array":
        n = max(schema.get("minItems", 1), 1)
        n = min(n, schema.get("maxItems", n))
        return [_fill(schema.get("items", {}), seed + i * 7, f"{path}[{i}]") for i in range(n)]
    if t == "integer":
        lo, hi = schema.get("minimum", 1), schema.get("maximum", 60)
        return min(hi, max(lo, 30 if "minutes" in path else lo + seed % (hi - lo + 1)))
    if t == "number":
        lo, hi = schema.get("minimum", 0), schema.get("maximum", 1)
        return round(lo + (hi - lo) * (0.7 + (seed % 3) / 10), 2)
    if t == "boolean":
        return True
    return _text(path, seed)


def _text(path: str, seed: int) -> str:
    leaf = re.sub(r"\[\d+\]", "", path).rsplit(".", 1)[-1]
    n = seed % 97
    samples = {
        "title": f"Ship one small piece of work, part {n}",
        "detail": "Pick one concrete task, finish it in a single sitting, and write down what you learned.",
        "question": f"How much time can you give this each week (option set {n})?",
        "label": f"Answer {n}",
        "note": "tells the move writer how much time they have",
        "feedback": "Clear and relevant. Add one sentence on what you would do next.",
        "headline": "CS student building data tools",
        "displayName": "Test Student",
        "major": "Computer Science",
        "institution": "Arizona State University",
        "position": "Student",
        "bio": "Builds small tools and dashboards.",
        "description": "A short description of the work.",
    }
    return samples.get(leaf, f"{leaf} {n}")


def _fix_moves(out: dict, step: int) -> dict:
    """Moves need distinct titles, at least 2 free, and the requested step."""
    for i, m in enumerate(out.get("moves", [])):
        m["title"] = f"Fake move {i + 1} for step {step} ({hashlib.sha1(str(i).encode()).hexdigest()[:4]})"
        m["cost"] = "free"
        m["step"] = step
        m["minutes"] = 30 + i * 10
    return out


async def generate(system: str, user: str, schema: dict, temperature: float | None = None) -> str:
    seed = int(hashlib.sha1(user.encode()).hexdigest()[:6], 16)
    out = _fill(schema, seed)
    if isinstance(out, dict) and "moves" in out:
        m = re.search(r"Set \"step\" to (\d)", user)
        out = _fix_moves(out, int(m.group(1)) if m else 1)
    if isinstance(out, dict) and "questions" in out:
        for i, q in enumerate(out["questions"]):
            q["question"] = f"Fake question {i + 1}?"
            q["answers"] = [f"Answer {i + 1}.{j}" for j in range(3)]
    return json.dumps(out)


def fake_backend() -> Backend:
    if not config.llm_fake:
        raise RuntimeError("the fake model is only available with ENV=test and LLM_FAKE=1")
    return Backend(id="fake:fake-1", provider="fake", model="fake-1", remote=False, generate=generate)
