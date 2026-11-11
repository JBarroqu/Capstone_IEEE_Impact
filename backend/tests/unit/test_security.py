"""Security layer: rate limiter, signed tokens, Supabase token checks, admin login rules, headers.
No database: SESSION_SECRET is set, and every request here is refused before a route touches the DB."""
import pytest
from fastapi.testclient import TestClient

import time

import jwt
from cryptography.hazmat.primitives.asymmetric import ec

from app.config import config
from app.main import app
from app.platform import admin_auth, auth, security
from app.platform.rate_limit import RateLimiter, Rule, limiter

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


# Supabase tokens on every user route

ROUTES = [("GET", "/api/v1/me"), ("GET", "/api/v1/profile"), ("PUT", "/api/v1/profile"), ("GET", "/api/v1/wishes"),
          ("POST", "/api/v1/wishes"), ("POST", "/api/v1/classify"), ("POST", f"/api/v1/wishes/{SID}/options"),
          ("GET", "/api/v1/growth"), ("POST", "/api/v1/invitations"), ("GET", "/api/v1/feed"), ("GET", "/api/v1/home")]


@pytest.mark.parametrize("method,path", ROUTES)
def test_user_routes_refuse_without_token(method, path):
    r = client.request(method, path, json={})
    assert r.status_code == 401 and r.json() == {"ok": False, "error": "unauthorized"}


def test_garbage_bearer_is_401():
    assert client.get("/api/v1/me", headers={"authorization": "Bearer not-a-jwt"}).status_code == 401


KEY = ec.generate_private_key(ec.SECP256R1())
OTHER_KEY = ec.generate_private_key(ec.SECP256R1())


def _token(key=KEY, kid="k1", **over):
    claims = {"iss": "http://supabase.test/auth/v1", "aud": "authenticated", "role": "authenticated", "sub": SID,
              "email": "a@b.c", "exp": int(time.time()) + 600, **over}
    return jwt.encode(claims, key, algorithm="ES256", headers={"kid": kid})


@pytest.fixture
def jwks(monkeypatch):
    monkeypatch.setattr(config, "supabase_url", "http://supabase.test")
    monkeypatch.setattr(auth, "_jwks", {"k1": jwt.PyJWK.from_dict({**jwt.algorithms.ECAlgorithm.to_jwk(KEY.public_key(), as_dict=True), "kid": "k1", "alg": "ES256"})})
    monkeypatch.setattr(auth, "_jwks_at", time.monotonic())


async def test_verify_accepts_valid_es256(jwks):
    u = await auth.verify(_token())
    assert u.id == SID and u.email == "a@b.c"


@pytest.mark.parametrize("over,key", [({"aud": "anon"}, KEY), ({"iss": "http://evil/auth/v1"}, KEY),
                                      ({"exp": int(time.time()) - 5}, KEY), ({"role": "anon"}, KEY), ({}, OTHER_KEY)])
async def test_verify_rejects_bad_tokens(jwks, over, key):
    with pytest.raises(auth.AuthError):
        await auth.verify(_token(key=key, **over))


async def test_hs256_only_with_legacy_secret(jwks, monkeypatch):
    tok = jwt.encode({"iss": "http://supabase.test/auth/v1", "aud": "authenticated", "role": "authenticated", "sub": SID,
                      "exp": int(time.time()) + 60}, "legacy-secret-legacy-secret-legacy-secret", algorithm="HS256")
    monkeypatch.setattr(config, "supabase_jwt_secret", "")
    with pytest.raises(auth.AuthError):
        await auth.verify(tok)
    monkeypatch.setattr(config, "supabase_jwt_secret", "legacy-secret-legacy-secret-legacy-secret")
    assert (await auth.verify(tok)).id == SID


# Body caps and rate limits over HTTP

def test_body_over_cap_is_refused():
    big = {"password": "x" * 5000}
    assert client.post("/api/admin/login", json=big).status_code == 401


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
    assert client.get("/api/admin/policies", cookies={admin_auth.ADMIN_COOKIE: "forged.1.x"}).status_code == 401


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
