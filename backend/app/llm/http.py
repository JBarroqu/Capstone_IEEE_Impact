import httpx

# One shared client; per-call timeouts come from the chain (asyncio), so httpx's own timeout is only a backstop.
_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(120, connect=10))
    return _client
