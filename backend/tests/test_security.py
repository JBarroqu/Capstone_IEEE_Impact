"""Public-facing layer: rate limiter, signed tokens, session cookie checks, body caps, admin login rules, headers.
No database: SESSION_SECRET is set, and every request here is refused before a route touches the DB."""
import pytest
from fastapi.testclient import TestClient

from wish_api import admin_auth, security
from wish_api.config import config
from wish_api.main import app
from wish_api.rate_limit import RateLimiter, Rule, limiter

SID = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setattr(config, "session_secret", "test-secret")
    monkeypatch.setattr(config, "rate_limit", True)
    monkeypatch.setattr(config, "trust_proxy", False)
    monkeypatch.setattr(config, "admin_password", "correct horse")
    monkeypatch.setattr(config, "admin_allow_http", False)
    limiter._m.clear()


client = TestClient(app, base_url="http://localhost")


def cookie_for(sid: str) -> dict:
    return {security.SESSION_COOKIE: security.make_token("test-secret", sid)}


# Rate limiter

def test_bucket_refuses_after_limit_and_refills():
    t = [0.0]
    rl, rule = RateLimiter(now=lambda: t[0]), Rule("x", 3, 60_000)
    assert [rl.take(rule, "a")[0] for _ in range(4)] == [True, True, True, False]
    assert rl.take(rule, "b")[0], "keys are separate"
    ok, retry = rl.take(rule, "a")
    assert not ok and 0 < retry <= 20_000
    t[0] += 20_000
    assert rl.take(rule, "a")[0]


def test_bucket_evicts_least_recently_used():
    rl, rule = RateLimiter(max_keys=2), Rule("x", 1, 60_000)
    rl.take(rule, "a"), rl.take(rule, "b"), rl.take(rule, "c")
    assert "x:a" not in rl._m and len(rl._m) == 2


# Signed tokens

def test_token_round_trip_tamper_and_expiry():
    tok = security.make_token("k", "abc", now_ms=1_000_000)
    assert security.verify_token("k", tok, 60_000, now_ms=1_030_000) == "abc"
    assert security.verify_token("other", tok, 60_000, now_ms=1_030_000) is None
    assert security.verify_token("k", tok.replace("abc", "abd"), 60_000, now_ms=1_030_000) is None
    assert security.verify_token("k", tok, 60_000, now_ms=1_000_000 + 60_001) is None
    assert security.verify_token("k", tok, 60_000, now_ms=1_000_000 - 120_000) is None  # issued in the future
    assert security.verify_token("k", "garbage", 60_000) is None
    assert security.verify_token("k", None, 60_000) is None


# Session cookie on the write and model routes

OPTIONS = {"step": 1, "ctx": {"wishText": "x", "type": "fixed", "focus": [], "domains": []}}


@pytest.mark.parametrize("path,body", [
    ("/api/options", OPTIONS),
    ("/api/classify", {"wishText": "x"}),
    ("/api/questions", {"wishText": "x", "type": "fixed", "focus": [], "domains": []}),
    ("/api/wish", {"id": OTHER, "sessionId": SID}),
    ("/api/events", {"events": [{"name": "consent_given", "payload": {}, "sessionId": SID, "participantCode": "TEST a"}]}),
])
def test_routes_refuse_without_session_cookie(path, body):
    r = client.post(path, json=body)
    assert r.status_code == 401 and r.json()["reason"] == "no_session"


def test_session_cookie_must_match_body():
    r = client.post("/api/wish", json={"id": OTHER, "sessionId": SID}, cookies=cookie_for(OTHER))
    assert r.status_code == 401
    r = client.post("/api/options", json={**OPTIONS, "sessionId": SID}, cookies=cookie_for(OTHER))
    assert r.status_code == 401
    ev = {"events": [{"name": "consent_given", "payload": {}, "sessionId": SID, "participantCode": "TEST a"}]}
    assert client.post("/api/events", json=ev, cookies=cookie_for(OTHER)).status_code == 401


def test_session_requires_consent_and_name():
    assert client.post("/api/session", json={"sessionId": SID, "participantCode": "a", "consented": False}).status_code == 400
    assert client.post("/api/session", json={"sessionId": SID, "participantCode": "  ", "consented": True}).status_code == 400


# Body caps and rate limits over HTTP

def test_body_over_cap_is_refused():
    big = {"sessionId": SID, "participantCode": "a" * 2000, "consented": True}
    assert client.post("/api/session", json=big).status_code == 400


def test_login_rate_limited_with_retry_after():
    codes = [client.post("/api/admin/login", json={"password": "nope nope"}).status_code for _ in range(11)]
    assert codes[:10] == [401] * 10 and codes[10] == 429
    r = client.post("/api/admin/login", json={"password": "nope nope"})
    assert r.json()["reason"] == "rate_limited" and int(r.headers["retry-after"]) >= 1


def test_forwarded_for_ignored_unless_proxy_trusted(monkeypatch):
    for i in range(10):
        client.post("/api/admin/login", json={"password": "x"}, headers={"x-forwarded-for": f"10.0.0.{i}"})
    assert client.post("/api/admin/login", json={"password": "x"}, headers={"x-forwarded-for": "10.0.0.99"}).status_code == 429
    monkeypatch.setattr(config, "trust_proxy", True)
    assert client.post("/api/admin/login", json={"password": "x"}, headers={"x-forwarded-for": "10.0.0.99"}).status_code == 401


# Admin

def test_admin_password_rules():
    assert admin_auth.admin_password_problem("") and admin_auth.admin_password_problem("change-me") and admin_auth.admin_password_problem("short")
    assert admin_auth.admin_password_problem("long enough") is None


def test_admin_login_and_cookie():
    r = client.post("/api/admin/login", json={"password": "correct horse"})
    assert r.status_code == 200
    set_cookie = r.headers["set-cookie"]
    assert "HttpOnly" in set_cookie and "SameSite=strict" in set_cookie
    token = r.cookies[admin_auth.ADMIN_COOKIE]
    assert "correct horse" not in token
    assert client.get("/api/admin/delete-test", cookies={admin_auth.ADMIN_COOKIE: "forged.1.x"}).status_code == 401


def test_admin_cookie_dies_when_password_changes(monkeypatch):
    token = client.post("/api/admin/login", json={"password": "correct horse"}).cookies[admin_auth.ADMIN_COOKIE]

    class Req:
        cookies = {admin_auth.ADMIN_COOKIE: token}

    import asyncio
    assert asyncio.run(admin_auth.is_admin(Req()))
    monkeypatch.setattr(config, "admin_password", "a new password")
    assert not asyncio.run(admin_auth.is_admin(Req()))


def test_admin_login_refused_with_weak_password(monkeypatch):
    monkeypatch.setattr(config, "admin_password", "change-me")
    assert client.post("/api/admin/login", json={"password": "change-me"}).status_code == 503


def test_admin_login_refused_over_lan_http():
    lan = TestClient(app, base_url="http://192.168.1.20:8000")
    r = lan.post("/api/admin/login", json={"password": "correct horse"})
    assert r.status_code == 403


# Headers

def test_security_headers_on_api_responses():
    r = client.get("/api/health")
    assert r.headers["x-frame-options"] == "DENY" and r.headers["x-content-type-options"] == "nosniff"
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]


def test_client_ip_is_rightmost_forwarded_hop(monkeypatch):
    """Render's proxy appends the address it saw; whatever the client sent sits to the left and is ignored."""
    monkeypatch.setattr(config, "trust_proxy", True)
    monkeypatch.setattr(config, "proxy_hops", 1)

    class Req:
        headers = {"x-forwarded-for": "6.6.6.6, 7.7.7.7, 203.0.113.9"}
        client = None

    assert security.client_ip(Req()) == "203.0.113.9"
    monkeypatch.setattr(config, "proxy_hops", 2)
    assert security.client_ip(Req()) == "7.7.7.7"
    monkeypatch.setattr(config, "trust_proxy", False)
    Req.client = type("C", (), {"host": "10.1.1.1"})
    assert security.client_ip(Req()) == "10.1.1.1"
