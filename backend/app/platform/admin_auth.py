"""Admin cookie: HMAC-signed and timestamped, expires on the server after 12 h, tied to the current password (changing
ADMIN_PASSWORD signs everyone out). Port of lib/admin-auth.ts at git tag public-hardening."""
from fastapi import Request

from ..config import config
from .security import get_secret, same_text, sign, make_token, verify_token

ADMIN_COOKIE = "wish_admin"
ADMIN_MAX_AGE_S = 12 * 60 * 60


def admin_password_problem(pw: str | None = None) -> str | None:
    """Why admin login is switched off, or None if the password is usable."""
    pw = config.admin_password if pw is None else pw
    if not pw:
        return "ADMIN_PASSWORD is not set."
    if pw == "change-me" or len(pw) < 8:
        return "ADMIN_PASSWORD is the default or shorter than 8 characters."
    return None


def _payload(secret: str) -> str:
    return f"admin:{sign(secret, 'pw:' + config.admin_password)[:16]}"


async def password_ok(pw: str) -> bool:
    if admin_password_problem():
        return False
    secret = await get_secret()
    return same_text(sign(secret, f"pw:{pw}"), sign(secret, f"pw:{config.admin_password}"))


async def new_admin_token() -> str:
    secret = await get_secret()
    return make_token(secret, _payload(secret))


async def is_admin(req: Request) -> bool:
    if admin_password_problem():
        return False
    v = req.cookies.get(ADMIN_COOKIE)
    if not v:
        return False
    secret = await get_secret()
    return verify_token(secret, v, ADMIN_MAX_AGE_S * 1000) == _payload(secret)
