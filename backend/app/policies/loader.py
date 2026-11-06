"""Resolves every policy: default -> env var -> admin override in core.settings ('policy:<KEY>'). Values are validated
on load and on admin save; a bad env value fails startup, a bad stored override is ignored and logged."""
import json
import logging
import os
import time
from contextlib import contextmanager
from typing import Any

from .defaults import BY_KEY, POLICIES, PolicyDef

log = logging.getLogger("impact.policies")
_admin: dict[str, Any] = {}
_test: dict[str, Any] = {}
_loaded_at = 0.0
REFRESH_S = 30


class PolicyError(ValueError):
    pass


def coerce(p: PolicyDef, raw: Any) -> Any:
    """Parse and validate a raw value (string from env, or JSON from the admin page)."""
    if p.kind == "bool":
        if isinstance(raw, bool):
            return raw
        s = str(raw).strip().lower()
        if s in ("1", "true", "yes", "on"):
            return True
        if s in ("0", "false", "no", "off"):
            return False
        raise PolicyError(f"{p.key}: expected true/false, got {raw!r}")
    if p.kind == "int":
        try:
            v = int(raw)
        except (TypeError, ValueError):
            raise PolicyError(f"{p.key}: expected a whole number, got {raw!r}")
        if (p.min is not None and v < p.min) or (p.max is not None and v > p.max):
            raise PolicyError(f"{p.key}: {v} is outside {p.min}..{p.max}")
        return v
    if p.kind == "list":
        items = raw if isinstance(raw, list) else [x.strip() for x in str(raw).split(",") if x.strip()]
        bad = [x for x in items if p.allowed_items and x not in p.allowed_items]
        if bad:
            raise PolicyError(f"{p.key}: unknown item(s) {bad}; allowed: {list(p.allowed_items)}")
        return list(dict.fromkeys(items))
    # choice
    for c in p.choices:
        if str(c) == str(raw).strip():
            return c
    raise PolicyError(f"{p.key}: {raw!r} is not one of {list(p.choices)}")


def _env(p: PolicyDef) -> tuple[bool, Any]:
    raw = os.environ.get(p.key)
    if raw is None or raw == "":
        return False, None
    return True, coerce(p, raw)


def validate_env() -> None:
    """Called at startup: a typo in an env override should stop the deploy, not silently fall back."""
    for p in POLICIES:
        _env(p)


def source(key: str) -> str:
    if key in _test:
        return "test"
    if key in _admin:
        return "admin"
    return "env" if _env(BY_KEY[key])[0] else "default"


def get(key: str) -> Any:
    p = BY_KEY[key]
    if key in _test:
        return _test[key]
    if key in _admin:
        return _admin[key]
    has, v = _env(p)
    return v if has else p.default


def snapshot() -> dict[str, Any]:
    """Every value in force now; stored on every ledger row so later switches never change past points."""
    return {p.key: get(p.key) for p in POLICIES}


def public() -> dict[str, Any]:
    return {p.key: get(p.key) for p in POLICIES if p.public}


async def refresh(force: bool = False) -> None:
    """Reload admin overrides from core.settings (every REFRESH_S seconds, or right after an admin save)."""
    global _admin, _loaded_at
    if not force and time.monotonic() - _loaded_at < REFRESH_S:
        return
    from sqlalchemy import select

    from .. import db

    try:
        async with db.read() as c:
            rows = (await c.execute(select(db.settings.c.key, db.settings.c.value).where(db.settings.c.key.like("policy:%")))).all()
    except Exception:
        log.exception("could not load policy overrides; keeping the previous ones")
        return
    loaded: dict[str, Any] = {}
    for k, v in rows:
        key = k.removeprefix("policy:")
        p = BY_KEY.get(key)
        if not p or not p.admin_editable:
            continue
        try:
            loaded[key] = coerce(p, v)
        except PolicyError as e:
            log.error("ignoring stored override: %s", e)
    _admin, _loaded_at = loaded, time.monotonic()


async def set_admin(key: str, value: Any, by: str = "admin") -> Any:
    """Save (value not None) or clear (None) an admin override. Returns the new effective value."""
    from sqlalchemy import delete
    from sqlalchemy.dialects.postgresql import insert

    from .. import db

    p = BY_KEY.get(key)
    if not p or not p.admin_editable:
        raise PolicyError(f"{key} can't be changed on the admin page")
    async with db.tx() as c:
        if value is None:
            await c.execute(delete(db.settings).where(db.settings.c.key == f"policy:{key}"))
        else:
            v = coerce(p, value)
            stmt = insert(db.settings).values(key=f"policy:{key}", value=json.loads(json.dumps(v)), updated_by=by)
            await c.execute(stmt.on_conflict_do_update(index_elements=[db.settings.c.key],
                                                       set_={"value": stmt.excluded.value, "updated_by": by}))
    await refresh(force=True)
    return get(key)


@contextmanager
def override(**values: Any):
    """Tests: force policy values (validated) for the duration of the block."""
    old = dict(_test)
    for k, v in values.items():
        _test[k] = coerce(BY_KEY[k], v)
    try:
        yield
    finally:
        _test.clear()
        _test.update(old)
