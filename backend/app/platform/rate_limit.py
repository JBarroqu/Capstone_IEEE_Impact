"""In-memory token buckets, one per (rule, key). Right for the single API process this runs as (one uvicorn worker);
several replicas would each keep their own counts, so move this to Postgres or Redis before scaling out.
Port of lib/rate-limit.ts at git tag public-hardening."""
import math
import time
from collections import OrderedDict
from dataclasses import dataclass

from fastapi.responses import JSONResponse

from ..config import config


@dataclass(frozen=True)
class Rule:
    name: str
    limit: int
    window_ms: int


class RateLimiter:
    def __init__(self, now=lambda: time.monotonic() * 1000, max_keys: int = 50_000):
        self._m: OrderedDict[str, list[float]] = OrderedDict()  # id -> [tokens, at]
        self._now = now
        self._max_keys = max_keys

    def take(self, rule: Rule, key: str) -> tuple[bool, int]:
        """Takes one token. Returns (ok, retry_after_ms), the wait until the next token when refused."""
        id, now, rate = f"{rule.name}:{key}", self._now(), rule.limit / rule.window_ms
        b = self._m.pop(id, None) or [float(rule.limit), now]
        b[0] = min(rule.limit, b[0] + (now - b[1]) * rate)
        b[1] = now
        self._m[id] = b  # re-insert: least recently used first
        if len(self._m) > self._max_keys:
            self._m.popitem(last=False)
        if b[0] >= 1:
            b[0] -= 1
            return True, 0
        return False, math.ceil((1 - b[0]) / rate)


MIN = 60_000


class rules:
    """Per-IP limits are loose because a lab of students can share one campus NAT address; per-user limits do the real
    work. Global ceilings hold even if a client fakes its IP. Login is strict to slow password guessing (docs/SECURITY.md)."""
    model_all = Rule("model:all", 300, MIN)
    model_ip = Rule("model:ip", 120, MIN)
    model_user = Rule("model:u", 20, MIN)
    evidence_all = Rule("evidence:all", 100, MIN)
    evidence_ip = Rule("evidence:ip", 30, MIN)
    evidence_user = Rule("evidence:u", 10, MIN)
    resume_all = Rule("resume:all", 30, MIN)
    resume_ip = Rule("resume:ip", 10, MIN)
    resume_user = Rule("resume:u", 3, MIN)
    events_ip = Rule("events:ip", 600, MIN)
    events_user = Rule("events:u", 60, MIN)
    write_ip = Rule("write:ip", 300, MIN)
    lookup_ip = Rule("lookup:ip", 60, MIN)
    lookup_user = Rule("lookup:u", 30, MIN)
    login_ip = Rule("login:ip", 10, 15 * MIN)
    admin_models_ip = Rule("admin-models:ip", 6, MIN)


limiter = RateLimiter()


def limited(*checks: tuple[Rule, str | None]) -> JSONResponse | None:
    """A 429 response if any (rule, key) pair is over its limit, else None. Keys that are None are skipped."""
    if not config.rate_limit:
        return None
    for rule, key in checks:
        if not key:
            continue
        ok, retry_ms = limiter.take(rule, key)
        if not ok:
            secs = max(1, math.ceil(retry_ms / 1000))
            return JSONResponse({"ok": False, "reason": "rate_limited", "retry_after_s": secs}, status_code=429, headers={"retry-after": str(secs)})
    return None
