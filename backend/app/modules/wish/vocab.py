"""Shared vocabulary (mirrors the frontend's lib/types.ts; keep the two in sync)."""
from typing import Literal

FOCUSES = ("learn", "goal", "system", "advance", "lead", "connect")
DOMAINS = ("career", "academic", "technical", "venture", "leadership")
ARCHETYPES = ("builder", "connector", "planner", "explorer")
FORMATS = ("solo", "peer", "group", "mentor", "course", "project", "event")

Focus = Literal["learn", "goal", "system", "advance", "lead", "connect"]
Domain = Literal["career", "academic", "technical", "venture", "leadership"]
Archetype = Literal["builder", "connector", "planner", "explorer"]
Format = Literal["solo", "peer", "group", "mentor", "course", "project", "event"]
WishType = Literal["open_ended", "fixed"]
FailReason = Literal["timeout", "invalid_json", "rate_limited", "error"]

DOMAIN_LABEL = {
    "career": "Career & Industry",
    "academic": "Academic Foundation",
    "technical": "Technical Mastery",
    "venture": "Venture & Impact",
    "leadership": "Leadership & Network",
}
FOCUS_LABEL = {"learn": "Learn", "goal": "Goal", "system": "System", "advance": "Advance", "lead": "Lead", "connect": "Connect"}
