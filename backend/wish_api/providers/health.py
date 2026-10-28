import re
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

MIN = 60_000


def now_ms() -> float:
    return time.time() * 1000


@dataclass
class HealthEntry:
    coolUntil: float = 0
    fails: int = 0
    gone: bool = False
    lastOkAt: float | None = None
    lastLatencyMs: float | None = None
    lastError: str | None = None
    lastErrorAt: float | None = None


class Health:
    """Per-backend circuit breaker: failing backends are skipped for a while so students don't wait on them."""

    def __init__(self, now=now_ms):
        self.m: dict[str, HealthEntry] = {}
        self.now = now

    def get(self, id: str) -> HealthEntry:
        return self.m.setdefault(id, HealthEntry())

    def ok(self, id: str, latency_ms: float) -> None:
        e = self.get(id)
        e.coolUntil, e.fails, e.gone, e.lastOkAt, e.lastLatencyMs = 0, 0, False, self.now(), latency_ms

    def fail(self, id: str, reason: str, detail: str, gone: bool = False, cool_ms: float | None = None) -> None:
        """`gone`: model missing or key rejected; skip for hours. Otherwise back off 1, 2, 4 ... 10 min (rate limits: 30 s).
        `cool_ms` overrides the wait, e.g. a used-up daily quota sits out until it resets."""
        e = self.get(id)
        e.fails += 1
        e.gone = gone
        e.lastError = f"{reason}: {detail}"[:200]
        e.lastErrorAt = self.now()
        if cool_ms is not None:
            ms = cool_ms
        elif gone:
            ms = 6 * 60 * MIN
        elif reason == "rate_limited":
            ms = 30_000
        else:
            ms = min(10 * MIN, MIN * 2 ** (e.fails - 1))
        e.coolUntil = self.now() + ms

    def cooling(self, id: str) -> bool:
        return self.get(id).coolUntil > self.now()

    def order(self, backends: list, preferred: str | None = None) -> list:
        """Healthy backends first (preferred one at the front, else config order); then cooling ones, soonest-recovering first. Gone ones last."""
        idx = {b.id: (-1 if b.id == preferred else i) for i, b in enumerate(backends)}
        healthy = sorted([b for b in backends if not self.cooling(b.id)], key=lambda b: idx[b.id])
        cool = [b for b in backends if self.cooling(b.id)]
        rank = lambda b: float("inf") if self.get(b.id).gone else self.get(b.id).coolUntil  # noqa: E731
        return healthy + sorted(cool, key=rank)

    def snapshot(self) -> dict:
        return {k: asdict(v) for k, v in self.m.items()}


def ms_until_pacific_midnight(now: float | None = None) -> float:
    """Gemini daily quotas reset at midnight Pacific time."""
    d = datetime.fromtimestamp((now if now is not None else now_ms()) / 1000, ZoneInfo("America/Los_Angeles"))
    return (24 * 3600 - (d.hour * 3600 + d.minute * 60 + d.second)) * 1000


def is_daily_quota(msg: str) -> bool:
    """A 429 that names a per-day quota (quotaId ...PerDay...), as opposed to the per-minute one."""
    return re.search(r"PerDay|per day|daily", msg, re.I) is not None


# Shared across requests and the admin dashboard in one server process (run a single worker).
health = Health()
