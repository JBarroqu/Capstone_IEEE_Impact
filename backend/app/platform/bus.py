"""In-process domain events (T-12). Modules publish inside a transaction; subscribers run after it commits, so a
notification is never written for work that rolled back. Subscribers must be idempotent (the feed dedupes on a key)."""
import contextvars
import logging
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import Awaitable, Callable

from ..contracts.events import DomainEvent

log = logging.getLogger("impact.bus")
Handler = Callable[[DomainEvent], Awaitable[None]]
_subscribers: dict[str, list[Handler]] = defaultdict(list)
_pending: contextvars.ContextVar[list[DomainEvent] | None] = contextvars.ContextVar("pending_events", default=None)


def subscribe(name: str, handler: Handler) -> None:
    if handler not in _subscribers[name]:
        _subscribers[name].append(handler)


def publish(event: DomainEvent) -> None:
    """Queue an event for delivery after the surrounding db.tx() commits. Outside a transaction it is queued for the
    next deliver() call by the caller; use publish_now() there."""
    pending = _pending.get()
    if pending is None:
        raise RuntimeError("publish() outside db.tx(); use await publish_now()")
    pending.append(event)


async def publish_now(event: DomainEvent) -> None:
    await deliver([event])


@asynccontextmanager
async def collect():
    outer = _pending.get()
    pending: list[DomainEvent] = []
    token = _pending.set(pending)
    try:
        yield pending
    except BaseException:
        pending.clear()
        raise
    finally:
        _pending.reset(token)
        # A nested transaction's events wait for the outer one.
        if outer is not None:
            outer.extend(pending)
            pending.clear()


async def deliver(events: list[DomainEvent]) -> None:
    for ev in list(events):
        for h in _subscribers.get(ev.name, []):
            try:
                await h(ev)
            except Exception:
                log.exception("subscriber %s failed for %s", getattr(h, "__name__", h), ev.name)
    events.clear()
