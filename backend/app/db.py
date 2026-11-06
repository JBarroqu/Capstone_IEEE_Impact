"""Async engine and the platform's own tables (core schema). Each module defines its own tables in its tables.py,
matching supabase/migrations (tests/integration/test_schema.py checks they agree)."""
from contextlib import asynccontextmanager

from sqlalchemy import Column, DateTime, Integer, MetaData, Table, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from .config import config

metadata = MetaData()
now = text("now()")
Uuid = UUID(as_uuid=False)

settings = Table(
    "settings", metadata,
    Column("key", Text, primary_key=True),
    Column("value", JSONB),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=now),
    Column("updated_by", Text),
    schema="core",
)

events = Table(
    "events", metadata,
    Column("id", Uuid, primary_key=True, server_default=text("gen_random_uuid()")),
    Column("user_id", Uuid, nullable=False),
    Column("client_session_id", Uuid),
    Column("wish_id", Uuid),
    Column("name", Text, nullable=False),
    Column("step", Integer),
    Column("payload", JSONB, nullable=False, server_default=text("'{}'::jsonb")),
    Column("app_version", Text, nullable=False),
    Column("provider", Text),
    Column("client_ts", DateTime(timezone=True)),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=now),
    schema="core",
)

_engine: AsyncEngine | None = None


def async_url(url: str) -> str:
    return url.replace("postgres://", "postgresql+asyncpg://", 1).replace("postgresql://", "postgresql+asyncpg://", 1)


def engine() -> AsyncEngine:
    global _engine
    if not config.database_url:
        raise RuntimeError("DATABASE_URL is not set")
    if _engine is None:
        # statement_cache_size=0: safe behind Supabase's pooler.
        _engine = create_async_engine(async_url(config.database_url), pool_size=5, max_overflow=2, pool_pre_ping=True,
                                      connect_args={"statement_cache_size": 0})
    return _engine


@asynccontextmanager
async def tx():
    """A transaction. Domain events published inside it are delivered after it commits (platform.bus)."""
    from .platform import bus

    async with bus.collect() as pending:
        async with engine().begin() as c:
            yield c
    await bus.deliver(pending)


@asynccontextmanager
async def read():
    async with engine().connect() as c:
        yield c


async def dispose() -> None:
    global _engine
    if _engine is not None:
        await _engine.dispose()
        _engine = None


Conn = AsyncConnection
