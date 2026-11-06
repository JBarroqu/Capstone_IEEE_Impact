import time

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from .. import db

KEY = "preferred_backend"
_pref: dict = {}


async def get_preferred_backend() -> str | None:
    """Backend id the admin chose to try first (None = automatic order). Cached 30 s; survives restarts via the settings table."""
    if _pref and time.monotonic() - _pref["at"] < 30:
        return _pref["v"]
    async with db.engine().connect() as c:
        row = (await c.execute(select(db.settings.c.value).where(db.settings.c.key == KEY).limit(1))).first()
    v = row[0] if row else None
    _pref.update(at=time.monotonic(), v=v)
    return v


async def set_preferred_backend(id: str | None) -> None:
    async with db.engine().begin() as c:
        stmt = insert(db.settings).values(key=KEY, value=id)
        await c.execute(stmt.on_conflict_do_update(index_elements=[db.settings.c.key], set_={"value": stmt.excluded.value, "updated_at": func.now()}))
    _pref.update(at=time.monotonic(), v=id)
