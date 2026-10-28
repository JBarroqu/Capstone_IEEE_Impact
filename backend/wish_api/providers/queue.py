import asyncio
import time

from .errors import QueueTimeout


class RateQueue:
    """Simple in-memory rate limiter: at most `per_minute` starts per rolling minute, FIFO."""

    def __init__(self, per_minute: int, now=time.monotonic):
        self.per_minute, self.now = per_minute, now
        self.starts: list[float] = []
        self.lock = asyncio.Lock()  # FIFO: waiters queue on the lock in arrival order

    async def acquire(self, max_wait_ms: float) -> None:
        """Returns when a slot is free; raises QueueTimeout if the wait would exceed max_wait_ms."""
        async with self.lock:
            now = self.now()
            self.starts = [t for t in self.starts if now - t < 60]
            if len(self.starts) >= self.per_minute:
                wait = 60 - (now - self.starts[0])
                if wait * 1000 > max_wait_ms:
                    raise QueueTimeout()
                await asyncio.sleep(wait)
            self.starts.append(self.now())
