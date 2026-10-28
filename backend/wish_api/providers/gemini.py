from ..config import config
from .backends import Backend
from .errors import RateLimited
from .http import client
from .queue import RateQueue

BASE = "https://generativelanguage.googleapis.com/v1beta"
_queues: dict[str, RateQueue] = {}


async def list_gemini_models() -> list[str]:
    """Model ids (without "models/") this key can call generateContent on."""
    res = await client().get(f"{BASE}/models", params={"pageSize": 200}, headers={"x-goog-api-key": config.gemini_key}, timeout=5)
    if res.status_code != 200:
        raise RuntimeError(f"gemini list {res.status_code}")
    models = res.json().get("models") or []
    return [m["name"].removeprefix("models/") for m in models if "generateContent" in (m.get("supportedGenerationMethods") or [])]


def _output_text(j: dict) -> str:
    """Text of the model_output steps (what the SDK exposes as output_text)."""
    parts = []
    for s in j.get("steps") or []:
        if s.get("type") == "model_output":
            parts.extend(c.get("text", "") for c in s.get("content") or [] if c.get("type") == "text")
    return "".join(parts)


def gemini_backend(model: str) -> Backend:
    # Free tier is ~10 req/min per model; each model gets its own budget.
    queue = _queues.setdefault(model, RateQueue(config.gemini_rpm))

    async def generate(system: str, user: str, schema: dict, temperature: float = 0.4) -> str:
        # Interactions API over REST (see docs/GEMINI-INTERACTIONS.md). Stateless: every call carries its full prompt and
        # store:false. No client-side retries: the chain retries and fails over itself, and cancelling the asyncio task
        # (the per-call timeout) closes the request.
        res = await client().post(
            f"{BASE}/interactions",
            headers={"x-goog-api-key": config.gemini_key},
            json={
                "model": model, "input": user, "system_instruction": system, "store": False,
                "response_format": {"type": "text", "mime_type": "application/json", "schema": schema},
                "generation_config": {"temperature": temperature},
            },
        )
        if res.status_code == 429 or "RESOURCE_EXHAUSTED" in res.text:
            raise RateLimited(f"{res.status_code} {res.text}")
        if res.status_code != 200:
            raise RuntimeError(f"{res.status_code} {res.text[:400]}")
        return _output_text(res.json())

    return Backend(id=f"gemini:{model}", provider="gemini", model=model, remote=True, generate=generate, acquire=queue.acquire)
