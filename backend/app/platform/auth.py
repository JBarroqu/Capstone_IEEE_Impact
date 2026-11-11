"""Supabase access-token check (T-04). Verified with the project's JWKS (ES256/RS256, keys cached <=10 min); a token
signed with the legacy HS256 secret is accepted only when SUPABASE_JWT_SECRET is set. The user id is `sub`; nothing in a
request body is trusted for identity."""
import logging
import time
from dataclasses import dataclass

import httpx
import jwt
from fastapi import Depends, HTTPException, Request
from jwt import PyJWK

from ..config import config

log = logging.getLogger("impact.auth")
JWKS_TTL_S = 600
_jwks: dict[str, PyJWK] = {}
_jwks_at = 0.0


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str | None


class AuthError(Exception):
    pass


def _issuer() -> str:
    return f"{config.supabase_url}/auth/v1"


async def _load_jwks(force: bool = False) -> dict[str, PyJWK]:
    global _jwks, _jwks_at
    if _jwks and not force and time.monotonic() - _jwks_at < JWKS_TTL_S:
        return _jwks
    async with httpx.AsyncClient(timeout=5) as c:
        r = await c.get(f"{_issuer()}/.well-known/jwks.json")
        r.raise_for_status()
        keys = r.json().get("keys", [])
    _jwks = {k["kid"]: PyJWK(k) for k in keys if k.get("kid")}
    _jwks_at = time.monotonic()
    return _jwks


async def verify(token: str) -> CurrentUser:
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as e:
        raise AuthError(f"malformed token: {e}") from e
    alg, kid = header.get("alg"), header.get("kid")
    opts = {"require": ["exp", "sub", "aud", "iss"]}
    try:
        if alg == "HS256":
            if not config.supabase_jwt_secret:
                raise AuthError("HS256 token but SUPABASE_JWT_SECRET is not set")
            claims = jwt.decode(token, config.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated",
                                issuer=_issuer(), options=opts)
        else:
            keys = await _load_jwks()
            if kid not in keys:  # key rotated since we cached the set
                keys = await _load_jwks(force=True)
            if kid not in keys:
                raise AuthError("unknown signing key")
            claims = jwt.decode(token, keys[kid].key, algorithms=["ES256", "RS256"], audience="authenticated",
                                issuer=_issuer(), options=opts)
    except jwt.PyJWTError as e:
        raise AuthError(str(e)) from e
    if claims.get("role") != "authenticated":
        raise AuthError("not an authenticated user token")
    return CurrentUser(id=claims["sub"], email=claims.get("email"))


def bearer(req: Request) -> str | None:
    h = req.headers.get("authorization") or ""
    return h[7:].strip() if h.lower().startswith("bearer ") else None


async def current_user(req: Request) -> CurrentUser:
    """FastAPI dependency: 401 {ok:false,error} unless a valid Supabase user token is sent."""
    token = bearer(req)
    if not token:
        raise HTTPException(401, "unauthorized")
    try:
        return await verify(token)
    except AuthError as e:
        log.info("token rejected: %s", e)
        raise HTTPException(401, "unauthorized") from None
    except httpx.HTTPError:
        log.exception("JWKS fetch failed")
        raise HTTPException(503, "auth unavailable") from None


User = Depends(current_user)
