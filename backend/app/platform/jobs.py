"""In-process background jobs (D-49, T-11): rubric scoring and resume reading run after the request returns. Jobs are
tracked so tests can wait for them; a startup sweep re-runs work left mid-way by a restart, and periodic tasks (the
buddy-review timeout, D-18) run on an interval. One API worker only."""
import asyncio
import logging
from typing import Awaitable, Callable

log = logging.getLogger("impact.jobs")
_running: set[asyncio.Task] = set()
_periodic: list[tuple[str, float, Callable[[], Awaitable[None]]]] = []
_startup: list[tuple[str, Callable[[], Awaitable[None]]]] = []
_loops: list[asyncio.Task] = []


def enqueue(name: str, fn: Callable[[], Awaitable[None]]) -> asyncio.Task:
    async def run():
        try:
            await fn()
        except Exception:
            log.exception("job %s failed", name)

    t = asyncio.create_task(run(), name=name)
    _running.add(t)
    t.add_done_callback(_running.discard)
    return t


async def drain(timeout: float = 30) -> None:
    """Wait for every queued job (tests, and graceful shutdown)."""
    while _running:
        await asyncio.wait(list(_running), timeout=timeout)


def on_startup(name: str, fn: Callable[[], Awaitable[None]]) -> None:
    _startup.append((name, fn))


def every(name: str, seconds: float, fn: Callable[[], Awaitable[None]]) -> None:
    _periodic.append((name, seconds, fn))


async def start() -> None:
    for name, fn in _startup:
        enqueue(f"startup:{name}", fn)
    for name, seconds, fn in _periodic:
        async def loop(fn=fn, seconds=seconds, name=name):
            while True:
                await asyncio.sleep(seconds)
                try:
                    await fn()
                except Exception:
                    log.exception("periodic %s failed", name)

        _loops.append(asyncio.create_task(loop(), name=f"every:{name}"))


async def stop() -> None:
    for t in _loops:
        t.cancel()
    _loops.clear()
    await drain(timeout=10)
