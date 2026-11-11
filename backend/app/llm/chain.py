from typing import Awaitable, Callable

from ..config import config
from .backends import Backend, get_backends
from .health import Health, health as shared_health
from .prefs import get_preferred_backend
from .run import LlmTask, RunResult, run_llm


async def run_chain(task: LlmTask, *, backends: Callable[[], Awaitable[list[Backend]]] | None = None,
                    preferred: Callable[[], Awaitable[str | None]] | None = None, health: Health | None = None,
                    timeout_ms: float | None = None, budget_ms: float | None = None) -> RunResult:
    """Run any task through the model chain with production defaults (overridable for tests)."""
    bs = await (backends or get_backends)()
    try:
        pref = await (preferred or get_preferred_backend)()
    except Exception:
        pref = None
    return await run_llm(task, backends=bs, preferred=pref, health=health or shared_health,
                         timeout_ms=timeout_ms or config.llm_timeout_ms, budget_ms=budget_ms or config.llm_budget_ms)
