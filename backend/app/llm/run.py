import asyncio
import re
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from .backends import Backend
from .errors import LlmUnavailable, QueueTimeout, RateLimited, Timeout
from .health import Health, is_daily_quota, ms_until_pacific_midnight
from .validate import ValidationError


@dataclass
class LlmTask:
    """A prompt the chain can answer: build it (with a fix-up hint on retry), then parse/validate the text (raise ValidationError to retry)."""

    schema: dict
    build: Callable[[str | None], dict]
    parse: Callable[[str], Any]
    temperature: float | None = None


@dataclass
class RunResult:
    value: Any
    backend: Backend
    latency_ms: int
    tried: list[dict] = field(default_factory=list)
    repaired: bool = False


def _ms() -> float:
    return time.monotonic() * 1000


def _classify(e: BaseException) -> tuple[str, bool]:
    """(reason, gone)."""
    msg = str(e)
    if isinstance(e, (RateLimited, QueueTimeout)) or re.search(r"429|RESOURCE_EXHAUSTED", msg, re.I):
        return "rate_limited", False
    if isinstance(e, (Timeout, asyncio.TimeoutError, TimeoutError)):
        return "timeout", False
    if re.search(r"\b(404|401|403)\b|NOT_FOUND|PERMISSION_DENIED|API key|not supported|no such model|model .*not found", msg, re.I):
        return "error", True
    return "error", False


async def run_llm(task: LlmTask, *, backends: list[Backend], health: Health, preferred: str | None, timeout_ms: float,
                  budget_ms: float, validation_retries: int = 1, queue_wait_ms: float = 3000) -> RunResult:
    """Walk the backends in health order until one returns valid output. A failing backend is put on cooldown and the
    next one is tried right away; the request only fails when every backend failed or the time budget ran out."""
    t0 = _ms()
    left = lambda: budget_ms - (_ms() - t0)  # noqa: E731
    tried: list[dict] = []
    last = {"reason": "error", "detail": "" if backends else "no models available"}

    for b in health.order(backends, preferred):
        if left() < 1000:
            last = {"reason": "timeout", "detail": "time budget used up"}
            break
        hint = None
        for attempt in range(validation_retries + 1):
            ts = _ms()
            try:
                async with asyncio.timeout(min(timeout_ms, left()) / 1000):
                    if b.acquire:
                        await b.acquire(min(queue_wait_ms, left()))
                    p = task.build(hint)
                    kw = {} if task.temperature is None else {"temperature": task.temperature}
                    text = await b.generate(p["system"], p["user"], task.schema, **kw)
                value = task.parse(text)
                health.ok(b.id, _ms() - ts)
                return RunResult(value, b, round(_ms() - t0), tried, attempt > 0)
            except ValidationError as e:
                # The backend works but its answer was off: ask once more with the problem spelled out, then move on.
                hint, last = str(e), {"reason": "invalid_json", "detail": str(e)[:300]}
                if attempt < validation_retries and left() > 1000:
                    continue
                tried.append({"id": b.id, "reason": "invalid_json"})
                break
            except Exception as e:
                full = str(e) or type(e).__name__
                if isinstance(e, TimeoutError):
                    full = "aborted"
                reason, gone = _classify(e)
                last = {"reason": reason, "detail": full[:300]}
                tried.append({"id": b.id, "reason": reason})
                # A full rate queue is local back-pressure, not a sick model: don't cool it down.
                if not isinstance(e, QueueTimeout):
                    daily = reason == "rate_limited" and is_daily_quota(full)
                    health.fail(b.id, reason, f"daily quota used up: {full[:300]}" if daily else full[:300], gone,
                                ms_until_pacific_midnight() if daily else None)
                break
    tried_s = f" (tried {', '.join(t['id'] + ':' + t['reason'] for t in tried)})" if tried else ""
    raise LlmUnavailable(last["reason"], f"{last['detail']}{tried_s}")
