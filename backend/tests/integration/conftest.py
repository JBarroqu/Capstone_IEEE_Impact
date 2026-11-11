"""Integration tests: the real app in-process against local Supabase (supabase start), with the test-only fake model.
Skipped when local Supabase isn't running. Users are created through Supabase Auth and deleted afterwards."""
import os
import uuid
from pathlib import Path

import httpx
import pytest

from app.config import config
from app.llm import backends
from app.platform.rate_limit import limiter

SUPA = os.environ.get("SUPABASE_URL", "http://127.0.0.1:54321")


def _up() -> bool:
    try:
        return httpx.get(f"{SUPA}/auth/v1/health", timeout=2, headers={"apikey": os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY", "")}).status_code < 500
    except httpx.HTTPError:
        return False


if not _up() and os.environ.get("REQUIRE_SUPABASE") == "1":
    # CI sets REQUIRE_SUPABASE=1 so a database that failed to start fails the run instead of skipping every test.
    raise RuntimeError(f"REQUIRE_SUPABASE=1 but Supabase is not reachable at {SUPA}")


def pytest_collection_modifyitems(config, items):
    """Skip this folder's tests when Supabase is down. (A `pytestmark` in conftest.py doesn't reach other files.)"""
    if _up():
        return
    here = Path(__file__).parent
    skip = pytest.mark.skip(reason="local Supabase is not running (npm run db:start)")
    for item in items:
        if here in item.path.parents:
            item.add_marker(skip)


@pytest.fixture(autouse=True)
def fake_model(monkeypatch):
    monkeypatch.setattr(config, "llm_fake", True)
    monkeypatch.setattr(config, "rate_limit", False)
    backends._cache.update(at=0.0, task=None)
    limiter._m.clear()
    yield
    backends._cache.update(at=0.0, task=None)


@pytest.fixture
async def api():
    from app.main import app

    transport = httpx.ASGITransport(app=app)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as c:
            yield c


class Users:
    def __init__(self):
        self.created: list[str] = []

    async def make(self, name: str) -> dict:
        email = f"{name}-{uuid.uuid4().hex[:8]}@example.com"
        async with httpx.AsyncClient() as c:
            r = await c.post(f"{SUPA}/auth/v1/signup", json={"email": email, "password": "test-password-123"},
                             headers={"apikey": os.environ["VITE_SUPABASE_PUBLISHABLE_KEY"]})
            r.raise_for_status()
            d = r.json()
        self.created.append(d["user"]["id"])
        return {"id": d["user"]["id"], "email": email, "h": {"authorization": f"Bearer {d['access_token']}"}}

    async def cleanup(self):
        async with httpx.AsyncClient() as c:
            for uid in self.created:
                await c.delete(f"{SUPA}/auth/v1/admin/users/{uid}", headers={
                    "apikey": config.supabase_secret_key, "authorization": f"Bearer {config.supabase_secret_key}"})


@pytest.fixture
async def users():
    u = Users()
    yield u
    await u.cleanup()
    from app import db

    await db.dispose()
