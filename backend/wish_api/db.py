"""Tables (same names, columns, defaults and indexes the Drizzle schema created) and the async engine."""
from sqlalchemy import Boolean, Column, DateTime, Index, Integer, MetaData, PrimaryKeyConstraint, Table, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from .config import config

metadata = MetaData()
now = text("now()")

sessions = Table(
    "sessions", metadata,
    Column("id", UUID(as_uuid=False), primary_key=True),
    Column("participant_code", Text, nullable=False),
    Column("provider", Text),
    Column("app_version", Text),
    Column("consented", Boolean, nullable=False, server_default=text("false")),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=now),
)

wishes = Table(
    "wishes", metadata,
    Column("id", UUID(as_uuid=False), primary_key=True),
    Column("session_id", UUID(as_uuid=False), nullable=False),
    Column("text", Text, nullable=False),
    Column("from_chip", Boolean, nullable=False, server_default=text("false")),
    Column("type", Text),
    Column("focus", JSONB),
    Column("domains", JSONB),
    Column("guessed_focus", JSONB),
    Column("guessed_domains", JSONB),
    Column("archetype", Text),
    Column("why", Text),
    Column("prior_attempts", JSONB),
    # Generated follow-up questions and the answers given (only for source "llm").
    Column("follow_ups", JSONB),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=now),
)

events = Table(
    "events", metadata,
    Column("id", UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=now),
    Column("client_ts", DateTime(timezone=True)),
    Column("session_id", UUID(as_uuid=False), nullable=False),
    Column("wish_id", UUID(as_uuid=False)),
    Column("participant_code", Text, nullable=False),
    Column("app_version", Text, nullable=False),
    Column("provider", Text),
    Column("name", Text, nullable=False),
    Column("step", Integer),
    Column("payload", JSONB, nullable=False, server_default=text("'{}'::jsonb")),
    Index("events_session_idx", "session_id"),
    Index("events_name_idx", "name"),
)

generated_moves = Table(
    "generated_moves", metadata,
    Column("id", Text, nullable=False),
    Column("session_id", UUID(as_uuid=False), nullable=False),
    Column("wish_id", UUID(as_uuid=False)),
    Column("step", Integer, nullable=False),
    Column("move", JSONB, nullable=False),
    Column("provider", Text, nullable=False),
    Column("model", Text),
    Column("prompt_version", Text),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=now),
    PrimaryKeyConstraint("id", "session_id", name="generated_moves_id_session_id_pk"),
)

settings = Table(
    "settings", metadata,
    Column("key", Text, primary_key=True),
    Column("value", JSONB),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=now),
)

_engine: AsyncEngine | None = None


def async_url(url: str) -> str:
    return url.replace("postgres://", "postgresql+asyncpg://", 1).replace("postgresql://", "postgresql+asyncpg://", 1)


def engine() -> AsyncEngine:
    global _engine
    if not config.database_url:
        raise RuntimeError("DATABASE_URL is not set")
    if _engine is None:
        _engine = create_async_engine(async_url(config.database_url), pool_size=5, max_overflow=0)
    return _engine
