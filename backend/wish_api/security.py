"""Signing key, signed tokens, the student session cookie, and request facts (client IP, https, local) used by the
rate limits and the admin login. Port of lib/secret.ts, lib/session-auth.ts and lib/request.ts at git tag public-hardening."""
import asyncio
import base64
import hashlib
import hmac
import secrets
import time

from fastapi import Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from . import db
from .config import config

SESSION_COOKIE = "wish_sess"
SESSION_MAX_AGE_S = 12 * 60 * 60
_KEY = "signing_secret"
_secret: str | None = None
_lock = asyncio.Lock()


async def get_secret() -> str:
    """SESSION_SECRET if set, else a random key created once and kept in the settings table, so cookies survive restarts."""
    global _secret
    if config.session_secret:
        return config.session_secret
    if _secret:
        return _secret
    async with _lock:
        if not _secret:
            async with db.engine().begin() as c:
                await c.execute(insert(db.settings).values(key=_KEY, value=secrets.token_hex(32)).on_conflict_do_nothing())
                _secret = (await c.execute(select(db.settings.c.value).where(db.settings.c.key == _KEY))).scalar_one()
    return _secret


def sign(secret: str, data: str) -> str:
    mac = hmac.new(secret.encode(), data.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).rstrip(b"=").decode()


def same_text(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def _b36(n: int) -> str:
    s = ""
    while True:
        n, r = divmod(n, 36)
        s = "0123456789abcdefghijklmnopqrstuvwxyz"[r] + s
        if not n:
            return s


def make_token(secret: str, payload: str, now_ms: int | None = None) -> str:
    """`payload.issuedAt.signature`, issuedAt in base-36 milliseconds."""
    body = f"{payload}.{_b36(now_ms if now_ms is not None else int(time.time() * 1000))}"
    return f"{body}.{sign(secret, body)}"


def verify_token(secret: str, token: str | None, max_age_ms: int, now_ms: int | None = None) -> str | None:
    """The payload if the signature matches and the token is younger than max_age_ms (and not from the future)."""
    if not token:
        return None
    body, dot, sig = token.rpartition(".")
    if not dot or not same_text(sig, sign(secret, body)):
        return None
    payload, dot, at = body.rpartition(".")
    try:
        issued = int(at, 36)
    except ValueError:
        return None
    now = now_ms if now_ms is not None else int(time.time() * 1000)
    if not dot or issued > now + 60_000 or now - issued > max_age_ms:
        return None
    return payload


def is_https(req: Request) -> bool:
    """Behind the proxy the original scheme arrives in X-Forwarded-Proto."""
    proto = req.headers.get("x-forwarded-proto") if config.trust_proxy else None
    return (proto or req.url.scheme) == "https"


def is_local(req: Request) -> bool:
    """True when the browser is on this machine (localhost URL), so plain http never crosses the network."""
    host = (req.headers.get("x-forwarded-host") if config.trust_proxy else None) or req.headers.get("host") or ""
    host = host.rsplit(":", 1)[0] if not host.endswith("]") else host
    return host in ("localhost", "127.0.0.1", "[::1]", "::1")


def client_ip(req: Request) -> str:
    """First X-Forwarded-For hop when TRUST_PROXY is on (the proxy overwrites whatever the client sent), else the socket
    address. Without a proxy in front, honouring the header would let anyone pick their own rate-limit key."""
    if config.trust_proxy:
        xff = (req.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        if xff:
            return xff
    return req.client.host if req.client else "unknown"


async def issue_session(res: Response, req: Request, session_id: str) -> None:
    """Proof that a session was created by /api/session after consent. The write routes only accept a sessionId that
    matches this cookie, so nobody can post events or wishes into a session they did not start."""
    res.set_cookie(SESSION_COOKIE, make_token(await get_secret(), session_id), httponly=True, samesite="lax", path="/",
                   max_age=SESSION_MAX_AGE_S, secure=is_https(req))


async def current_session(req: Request) -> str | None:
    v = req.cookies.get(SESSION_COOKIE)
    return verify_token(await get_secret(), v, SESSION_MAX_AGE_S * 1000) if v else None
