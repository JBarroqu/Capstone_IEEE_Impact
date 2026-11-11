"""feed schema (supabase/migrations/*_feed_storage.sql)."""
from sqlalchemy import Column, DateTime, Table, Text, text
from sqlalchemy.dialects.postgresql import JSONB

from ...db import Uuid, metadata, now

notifications = Table(
    "notifications", metadata,
    Column("id", Uuid, primary_key=True, server_default=text("gen_random_uuid()")),
    Column("user_id", Uuid, nullable=False),
    Column("category", Text, nullable=False),
    Column("kind", Text, nullable=False),
    Column("title", Text, nullable=False),
    Column("body", Text, nullable=False, server_default=""),
    Column("link", Text),
    Column("source_module", Text, nullable=False),
    Column("source_id", Uuid),
    Column("dedupe_key", Text, nullable=False),
    Column("payload", JSONB, nullable=False, server_default=text("'{}'::jsonb")),
    Column("read_at", DateTime(timezone=True)),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=now),
    schema="feed",
)
