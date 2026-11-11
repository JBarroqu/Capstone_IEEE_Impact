"""profile schema (supabase/migrations/*_profile.sql)."""
from sqlalchemy import ARRAY, Column, DateTime, Integer, Table, Text, text
from sqlalchemy.dialects.postgresql import CITEXT, JSONB

from ...db import Uuid, metadata, now

profiles = Table(
    "profiles", metadata,
    Column("user_id", Uuid, primary_key=True),
    Column("handle", CITEXT),
    Column("display_name", Text, nullable=False, server_default=""),
    Column("headline", Text, nullable=False, server_default=""),
    Column("bio", Text, nullable=False, server_default=""),
    Column("education", JSONB, nullable=False, server_default=text("'{}'::jsonb")),
    Column("position", Text, nullable=False, server_default=""),
    Column("target_career_id", Text),
    Column("skills", ARRAY(Text), nullable=False, server_default="{}"),
    Column("interests", ARRAY(Text), nullable=False, server_default="{}"),
    Column("strengths", ARRAY(Text), nullable=False, server_default="{}"),
    Column("growth_areas", ARRAY(Text), nullable=False, server_default="{}"),
    Column("onboarding_completed_at", DateTime(timezone=True)),
    Column("last_seen_at", DateTime(timezone=True)),
    Column("previous_seen_at", DateTime(timezone=True)),
    Column("version", Integer, nullable=False, server_default="1"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=now),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=now),
    schema="profile",
)

contributions = Table(
    "contributions", metadata,
    Column("id", Uuid, primary_key=True, server_default=text("gen_random_uuid()")),
    Column("user_id", Uuid, nullable=False),
    Column("title", Text, nullable=False),
    Column("type", Text, nullable=False, server_default="project"),
    Column("description", Text, nullable=False, server_default=""),
    Column("verification_status", Text, nullable=False, server_default="self_reported"),
    Column("evidence_id", Uuid),
    Column("position", Integer, nullable=False, server_default="0"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=now),
    schema="profile",
)

resume_imports = Table(
    "resume_imports", metadata,
    Column("id", Uuid, primary_key=True, server_default=text("gen_random_uuid()")),
    Column("user_id", Uuid, nullable=False),
    Column("storage_path", Text),
    Column("mime", Text),
    Column("size_bytes", Integer),
    Column("status", Text, nullable=False, server_default="uploaded"),
    Column("text_chars", Integer),
    Column("draft", JSONB),
    Column("provider", Text),
    Column("model", Text),
    Column("prompt_version", Text),
    Column("error", Text),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=now),
    schema="profile",
)
