import json
import os
import re

from .backends import Backend
from .errors import RateLimited
from .http import client

# Free-tier services with an OpenAI-compatible API. Each is used only when its key is set.
OPENAI_COMPAT = {
    "groq": {
        "label": "Groq",
        "base": "https://api.groq.com/openai/v1",
        "key": lambda: os.environ.get("GROQ_API_KEY", ""),
        "pinned": lambda: os.environ.get("GROQ_MODELS", ""),
        "prefer": ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.1-8b-instant"],
        "skip": re.compile(r"whisper|guard|tts|orpheus|playai|allam|compound", re.I),
    },
    "openrouter": {
        "label": "OpenRouter",
        "base": "https://openrouter.ai/api/v1",
        "key": lambda: os.environ.get("OPENROUTER_API_KEY", ""),
        "pinned": lambda: os.environ.get("OPENROUTER_MODELS", ""),
        "prefer": [],
        "skip": re.compile(r"^(?!.*:free$)"),  # free models only
    },
}


async def list_openai_models(p: str) -> list[str]:
    """Up to 3 chat models: pinned list if set, else the preferred ones that exist, then anything else allowed."""
    c = OPENAI_COMPAT[p]
    pinned = [s.strip() for s in c["pinned"]().split(",") if s.strip()]
    if pinned:
        return pinned
    res = await client().get(f"{c['base']}/models", headers={"authorization": f"Bearer {c['key']()}"}, timeout=5)
    if res.status_code != 200:
        raise RuntimeError(f"{p} list {res.status_code}")
    ids = [m["id"] for m in res.json().get("data") or [] if not c["skip"].search(m["id"])]
    pref = [m for m in c["prefer"] if m in ids]
    return (pref + [i for i in ids if i not in pref])[:3]


def openai_backend(p: str, model: str) -> Backend:
    c = OPENAI_COMPAT[p]

    async def generate(system: str, user: str, schema: dict, temperature: float = 0.4) -> str:
        res = await client().post(
            f"{c['base']}/chat/completions",
            headers={"authorization": f"Bearer {c['key']()}"},
            json={
                "model": model, "temperature": temperature, "response_format": {"type": "json_object"},
                # These APIs don't all accept a JSON schema, so it goes in the prompt.
                "messages": [
                    {"role": "system", "content": f"{system}\n\nReturn a JSON object matching this JSON schema:\n{json.dumps(schema, separators=(',', ':'))}"},
                    {"role": "user", "content": user},
                ],
            },
        )
        if res.status_code == 429:
            raise RateLimited(f"{p} 429")
        if res.status_code != 200:
            raise RuntimeError(f"{p} {res.status_code} {res.text[:200]}")
        return ((res.json().get("choices") or [{}])[0].get("message") or {}).get("content") or ""

    return Backend(id=f"{p}:{model}", provider=p, model=model, remote=True, generate=generate)
