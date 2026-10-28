import asyncio
import re
import time
from dataclasses import dataclass, field
from typing import Awaitable, Callable

from ..config import config

# generate(system, user, schema, temperature) -> raw model text
Generate = Callable[[str, str, dict, float], Awaitable[str]]


@dataclass
class Backend:
    """One model at one provider. `generate` returns raw model text; the schema is the expected JSON shape."""

    id: str  # "gemini:gemini-3.5-flash-lite"
    provider: str
    model: str
    remote: bool
    generate: Generate
    # Optional per-backend rate limit; returns when a slot is free, raises QueueTimeout if the wait would exceed max_wait_ms.
    acquire: Callable[[float], Awaitable[None]] | None = field(default=None)


GEMINI_SKIP = re.compile(r"(tts|image|audio|live|embed|vision|robotics|computer|omni|nano|banana|thinking|exp|learnlm|gemma|aqa|veo|imagen|native|dialog|search|research|customtools|-\d{3}$)")


def rank_gemini_models(ids: list[str]) -> list[str]:
    """Order Gemini model ids for move generation: lite, then flash, then pro; stable before preview/-latest; newest version first.
    Unknown shapes are dropped. Pure, for tests."""

    def score(id: str):
        tier = 0 if "flash-lite" in id else 1 if "flash" in id else 2
        unstable = 0.5 if re.search(r"preview|latest", id) else 0
        m = re.search(r"gemini-(\d+(?:\.\d+)?)", id)
        return (tier + unstable, -(float(m.group(1)) if m else 0), id)

    uniq = list(dict.fromkeys(re.sub(r"^models/", "", i) for i in ids))
    keep = [i for i in uniq if i.startswith("gemini-") and re.search(r"flash|pro", i) and not GEMINI_SKIP.search(i)]
    return sorted(keep, key=score)


def _list(s: str) -> list[str]:
    return [x.strip() for x in s.split(",") if x.strip()]


async def _discover() -> list[Backend]:
    """Every backend this server can use for the configured MOVE_PROVIDER, in fallback order."""
    from .gemini import gemini_backend, list_gemini_models
    from .ollama import list_ollama_models, ollama_backend
    from .openai_compat import OPENAI_COMPAT, list_openai_models, openai_backend

    mode = config.provider
    out: list[Backend] = []
    if mode in ("auto", "gemini") and config.gemini_key:
        pinned = _list(config.gemini_models)
        if pinned:
            found = pinned
        else:
            try:
                found = rank_gemini_models(await list_gemini_models())[: config.gemini_max_models]
            except Exception:
                found = []
        # If listing fails (network down at boot), keep a known-good default so the chain is never empty.
        for m in found or ["gemini-3.5-flash-lite", "gemini-flash-lite-latest"]:
            out.append(gemini_backend(m))
    if mode == "auto":
        for p, c in OPENAI_COMPAT.items():
            if not c["key"]():
                continue
            try:
                models = await list_openai_models(p)
            except Exception:
                models = []
            out.extend(openai_backend(p, m) for m in models)
    if mode in ("auto", "ollama"):
        try:
            out.extend(ollama_backend(m) for m in await list_ollama_models())
        except Exception:
            pass
    return out


TTL = 10 * 60
_cache: dict = {"at": 0.0, "task": None}


async def get_backends(refresh: bool = False) -> list[Backend]:
    """Cached discovery (10 min). `refresh` forces a new listing, e.g. from the admin page."""
    if refresh or _cache["task"] is None or time.monotonic() - _cache["at"] > TTL:
        task = asyncio.ensure_future(_discover())
        _cache.update(at=time.monotonic(), task=task)
    task = _cache["task"]
    result = await asyncio.shield(task)
    if not result and _cache["task"] is task:
        _cache["at"] = 0.0  # retry discovery soon if empty
    return result


def remote_services() -> list[str]:
    """Names of outside services student text may be sent to (for the consent screen)."""
    from .openai_compat import OPENAI_COMPAT

    s = []
    if config.provider in ("auto", "gemini") and config.gemini_key:
        s.append("Google Gemini")
    if config.provider == "auto":
        s.extend(c["label"] for c in OPENAI_COMPAT.values() if c["key"]())
    return s
