"""Domain events v0.1 (docs/CONTRACTS.md). Published by modules via platform.bus; the feed turns them into notifications."""
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

EventName = Literal[
    "ProfileUpdated", "MoveSelected", "NextMoveReady",
    "EvidenceSubmitted", "EvidenceScored", "EvidenceValidated", "EvidenceNeedsWork", "TierReached", "UnlockGranted",
    "InvitationCreated", "InvitationAccepted", "InvitationDeclined", "FeedbackSubmitted",
]


class DomainEvent(BaseModel):
    schemaVersion: Literal["0.1"] = "0.1"
    eventId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: EventName
    occurredAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    userId: str
    refs: dict[str, Any] = Field(default_factory=dict)
