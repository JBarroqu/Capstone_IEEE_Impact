import re

from ..config import config
from .backends import Backend
from .http import client


async def list_ollama_models() -> list[str]:
    """Pulled models on the local Ollama server; [] if it is not running. OLLAMA_MODEL (if pulled) goes first."""
    res = await client().get(f"{config.ollama_url}/api/tags", timeout=1)
    if res.status_code != 200:
        return []
    names = [m["name"] for m in res.json().get("models") or [] if not re.search("embed", m["name"], re.I)]
    pref = next((n for n in names if n in (config.ollama_model, f"{config.ollama_model}:latest")), None)
    return ([pref] + [n for n in names if n != pref] if pref else names)[:2]


def ollama_backend(model: str) -> Backend:
    async def generate(system: str, user: str, schema: dict, temperature: float = 0.4) -> str:
        res = await client().post(
            f"{config.ollama_url}/api/chat",
            json={
                "model": model, "stream": False, "format": schema, "options": {"temperature": temperature},
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            },
        )
        if res.status_code != 200:
            raise RuntimeError(f"ollama {res.status_code}")
        return (res.json().get("message") or {}).get("content") or ""

    return Backend(id=f"ollama:{model}", provider="ollama", model=model, remote=False, generate=generate)
