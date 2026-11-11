"""growth schema (supabase/migrations/*_growth.sql)."""
from sqlalchemy import Boolean, Column, DateTime, Numeric, Table, Text, text
from sqlalchemy.dialects.postgresql import JSONB

from ...db import Uuid, metadata, now

evidence = Table(
    "evidence", metadata,
    Column("id", Uuid, primary_key=True, server_default=text("gen_random_uuid()")),
    Column("user_id", Uuid, nullable=False),
    Column("selected_move_id", Uuid, nullable=False),
    Column("revision_of", Uuid),
    Column("skill_id", Text, nullable=False),
    Column("activity_type", Text, nullable=False),
    Column("difficulty", Text, nullable=False),
    Column("difficulty_final", Text),
    Column("artifact_type", Text, nullable=False),
    Column("artifact_url", Text),
    Column("storage_path", Text),
    Column("file_name", Text),
    Column("file_mime", Text),
    Column("summary", Text, nullable=False),
    Column("status", Text, nullable=False, server_default="scoring"),
    Column("ai_score", Numeric),
    Column("ai_confidence", Numeric),
    Column("ai_feedback", Text),
    Column("ai_criteria", JSONB),
    Column("ai_provider", Text),
    Column("ai_model", Text),
    Column("rubric_version", Text),
    Column("final_quality", Numeric),
    Column("peer_confirmed", Boolean),
    Column("rules_version", Text),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=now),
    Column("finalized_at", DateTime(timezone=True)),
    schema="growth",
)

score_events = Table(
    "score_events", metadata,
    Column("id", Uuid, primary_key=True, server_default=text("gen_random_uuid()")),
    Column("user_id", Uuid, nullable=False),
    Column("kind", Text, nullable=False),
    Column("points", Numeric(8, 2), nullable=False),
    Column("evidence_id", Uuid),
    Column("selected_move_id", Uuid),
    Column("skill_id", Text),
    Column("reason_code", Text, nullable=False),
    Column("rules_version", Text, nullable=False),
    Column("policy_snapshot", JSONB, nullable=False, server_default=text("'{}'::jsonb")),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=now),
    schema="growth",
)

unlocks = Table(
    "unlocks", metadata,
    Column("user_id", Uuid, primary_key=True),
    Column("opportunity_id", Text, primary_key=True),
    Column("tier", Text, nullable=False),
    Column("source_evidence_id", Uuid),
    Column("unlocked_at", DateTime(timezone=True), nullable=False, server_default=now),
    schema="growth",
)

endorsements = Table(
    "endorsements", metadata,
    Column("id", Uuid, primary_key=True, server_default=text("gen_random_uuid()")),
    Column("user_id", Uuid, nullable=False),
    Column("skill_id", Text, nullable=False),
    Column("tier", Text, nullable=False, server_default="Verified"),
    Column("note", Text),
    Column("created_by", Text, nullable=False, server_default="admin"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=now),
    schema="growth",
)
