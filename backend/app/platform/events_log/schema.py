from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, conlist, field_validator

EVENT_NAMES = (
    "session_started", "consent_given", "wish_submitted", "classification_guessed", "classification_confirmed",
    "why_submitted", "prior_attempts_submitted", "quiz_answered", "archetype_assigned", "options_shown",
    "provider_fallback", "option_selected", "option_deselected", "move_locked", "options_rejected",
    "step_skipped", "options_feedback", "path_completed", "path_rated", "would_do_this_week",
    "paid_willingness", "open_feedback", "start_over", "session_abandoned", "options_relaxed", "options_failed", "quiz_skipped",
    "questions_shown", "evidence_submitted", "buddy_invited", "feedback_given", "page_view",
)
EventName = Literal[EVENT_NAMES]  # type: ignore[valid-type]


class Event(BaseModel):
    # Client-made uuid, so a batch that is retried after a lost response is not stored twice.
    id: str | None = Field(default=None, pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    name: EventName
    clientTs: datetime | None = None
    # The browser tab's id (analytics groups a visit); the user comes from the token, never from here.
    clientSessionId: str | None = Field(default=None, pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    wishId: str | None = Field(default=None, pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    step: int | None = Field(default=None, ge=1, le=5)
    payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("payload", mode="before")
    @classmethod
    def _payload(cls, v):
        return {} if v is None else v


class EventBatch(BaseModel):
    events: conlist(Event, max_length=100)
    ticket: str | None = Field(default=None, max_length=300)
