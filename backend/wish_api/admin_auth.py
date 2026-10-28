import hashlib
import hmac

from fastapi import Request

from .config import config

ADMIN_COOKIE = "wish_admin"


def token_for(pw: str) -> str:
    # Same token the Next.js backend issued, so existing admin cookies stay valid.
    return hashlib.sha256(f"wish-admin:{pw}".encode()).hexdigest()


def password_ok(pw: str) -> bool:
    return bool(config.admin_password) and hmac.compare_digest(token_for(pw), token_for(config.admin_password))


def is_admin(req: Request) -> bool:
    if not config.admin_password:
        return False
    v = req.cookies.get(ADMIN_COOKIE)
    return bool(v) and hmac.compare_digest(v, token_for(config.admin_password))
