"""wish schema (supabase/migrations/*_wish.sql)."""
from sqlalchemy import Boolean, Column, DateTime, Integer, Table, Text, text
from sqlalchemy.dialects.postgresql import JSONB

from ...db import Uuid, metadata, now

wishes = Table(
    "wishes", metadata,
    Column("id", Uuid, primary_key=True),
    Column("user_id", Uuid, nullable=False),
    Column("text", Text, nullable=False, server_default=""),
    Column("from_chip", Boolean, nullable=False, server_default=text("false")),
    Column("type", Text),
    Column("focus", JSONB),
    Column("domains", JSONB),
    Column("guessed_type", Text),
    Column("guessed_focus", JSONB),
    Column("guessed_domains", JSONB),
    Column("archetype", Text),
    Column("why", Text),
    Column("prior_attempts", JSONB),
    Column("follow_ups", JSONB),
    Column("status", Text, nullable=False, server_default="active"),
    Column("current_step", Integer, nullable=False, server_default="1"),
    Column("profile_version", Integer),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=now),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=now),
    schema="wish",
)

moves = Table(
    "moves", metadata,
    Column("id", Uuid, primary_key=True, server_default=text("gen_random_uuid()")),
    Column("user_id", Uuid, nullable=False),
    Column("wish_id", Uuid, nullable=False),
    Column("move_key", Text, nullable=False),
    Column("step", Integer, nullable=False),
    Column("position", Integer, nullable=False),
    Column("reroll_index", Integer, nullable=False, server_default="0"),
    Column("payload", JSONB, nullable=False),
    Column("provider", Text),
    Column("model", Text),
    Column("prompt_version", Text),
    Column("latency_ms", Integer),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=now),
    schema="wish",
)

selected_moves = Table(
    "selected_moves", metadata,
    Column("id", Uuid, primary_key=True, server_default=text("gen_random_uuid()")),
    Column("user_id", Uuid, nullable=False),
    Column("wish_id", Uuid, nullable=False),
    Column("move_id", Uuid, nullable=False),
    Column("step", Integer, nullable=False),
    Column("contract", JSONB, nullable=False),
    Column("skill_id", Text),
    Column("activity_type", Text),
    Column("difficulty", Text),
    Column("status", Text, nullable=False, server_default="active"),
    Column("selected_at", DateTime(timezone=True), nullable=False, server_default=now),
    Column("closed_at", DateTime(timezone=True)),
    schema="wish",
)
