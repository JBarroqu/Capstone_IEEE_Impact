"""social schema (supabase/migrations/*_social.sql)."""
from sqlalchemy import Boolean, Column, DateTime, SmallInteger, Table, Text, text
from sqlalchemy.dialects.postgresql import JSONB

from ...db import Uuid, metadata, now

invitations = Table(
    "invitations", metadata,
    Column("id", Uuid, primary_key=True, server_default=text("gen_random_uuid()")),
    Column("selected_move_id", Uuid, nullable=False),
    Column("owner_id", Uuid, nullable=False),
    Column("buddy_id", Uuid, nullable=False),
    Column("role", Text, nullable=False),
    Column("status", Text, nullable=False, server_default="pending"),
    Column("message", Text),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=now),
    Column("responded_at", DateTime(timezone=True)),
    schema="social",
)

feedback = Table(
    "feedback", metadata,
    Column("id", Uuid, primary_key=True, server_default=text("gen_random_uuid()")),
    Column("invitation_id", Uuid, nullable=False),
    Column("author_id", Uuid, nullable=False),
    Column("evidence_id", Uuid),
    Column("rating", SmallInteger),
    Column("confirms", Boolean),
    Column("body", Text, nullable=False, server_default=""),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=now),
    schema="social",
)

social_evidence = Table(
    "social_evidence", metadata,
    Column("id", Uuid, primary_key=True, server_default=text("gen_random_uuid()")),
    Column("feedback_id", Uuid, nullable=False),
    Column("evidence_id", Uuid, nullable=False),
    Column("reviewer_id", Uuid, nullable=False),
    Column("reviewer_role", Text, nullable=False),
    Column("reviewer_tier", Text, nullable=False),
    Column("rating", SmallInteger),
    Column("confirmed", Boolean),
    Column("counts_toward_points", Boolean, nullable=False),
    Column("contract", JSONB, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=now),
    schema="social",
)
