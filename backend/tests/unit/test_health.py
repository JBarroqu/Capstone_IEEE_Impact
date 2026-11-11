"""/api/v1/health reports the running commit; the deploy pipeline waits for it (.github/workflows/deploy.yml)."""
import httpx

from app.config import config
from app.main import app


async def _health() -> dict:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get("/api/v1/health")
    assert r.status_code == 200
    return r.json()


async def test_health_reports_commit(monkeypatch):
    monkeypatch.setattr(config, "git_commit", "abc123")
    assert await _health() == {"ok": True, "commit": "abc123"}


async def test_health_without_commit(monkeypatch):
    monkeypatch.setattr(config, "git_commit", "")
    assert await _health() == {"ok": True, "commit": None}
