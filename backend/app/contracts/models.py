"""Versioned contracts between modules (docs/CONTRACTS.md). camelCase in JSON. Bump schemaVersion on any change;
tests/contracts checks the exported JSON Schemas against contracts/schemas/*.json."""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Str40 = Annotated[str, Field(max_length=40)]
ActivityType = Literal["explore", "create", "test", "share", "connect", "enable"]
Difficulty = Literal["easy", "moderate", "hard"]
Tier = Literal["Not started", "Familiar", "Proficient", "Demonstrated", "Verified"]
Category = Literal["Social", "Pro", "Enablement", "Impact", "Events", "Growth"]
SelectedMoveStatus = Literal["active", "evidence_submitted", "awaiting_review", "validated", "needs_work", "abandoned"]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---- ProfessionalState v0.1 (Module 1) -------------------------------------------------------------------------
class Education(Contract):
    institution: str = Field(default="", max_length=120)
    major: str = Field(default="", max_length=120)
    gradYear: int | None = Field(default=None, ge=1950, le=2100)


class Contribution(Contract):
    id: str | None = None
    title: str = Field(min_length=1, max_length=120)
    type: Literal["project", "coursework", "professional", "other"] = "project"
    description: str = Field(default="", max_length=1000)
    verificationStatus: Literal["self_reported", "verified"] = "self_reported"
    evidenceId: str | None = None


class ProfessionalState(Contract):
    schemaVersion: Literal["0.1"] = "0.1"
    userId: str
    handle: str | None = None
    displayName: str = Field(default="", max_length=80)
    headline: str = Field(default="", max_length=120)
    bio: str = Field(default="", max_length=1000)
    education: Education = Field(default_factory=Education)
    position: str = Field(default="", max_length=80)
    targetCareerId: str | None = None
    skills: list[Str40] = Field(default_factory=list, max_length=30)
    interests: list[Str40] = Field(default_factory=list, max_length=20)
    strengths: list[Str40] = Field(default_factory=list, max_length=10)
    growthAreas: list[Str40] = Field(default_factory=list, max_length=10)
    featuredContributions: list[Contribution] = Field(default_factory=list, max_length=10)
    onboardingCompletedAt: datetime | None = None
    version: int = 1
    updatedAt: datetime | None = None


# ---- SelectedMove v0.1 (Module 2) ------------------------------------------------------------------------------
class PriorAttempts(Contract):
    chips: list[Str40] = Field(default_factory=list, max_length=10)
    text: str | None = Field(default=None, max_length=1000)


class FollowUpAnswer(Contract):
    question: str = Field(max_length=200)
    answer: str = Field(max_length=80)
    note: str | None = Field(default=None, max_length=200)


class WishSnapshot(Contract):
    text: str
    type: Literal["open_ended", "fixed"] | None = None
    focus: list[str] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    why: str | None = None
    priorAttempts: PriorAttempts = Field(default_factory=PriorAttempts)
    followUps: list[FollowUpAnswer] = Field(default_factory=list)


class Move(Contract):
    id: str
    key: str
    title: str
    detail: str
    step: int
    minutes: int
    cost: Literal["free", "paid"]
    format: str
    focus: list[str]
    domains: list[str]
    archetypeFit: dict[str, float] = Field(default_factory=dict)
    activityType: ActivityType
    difficulty: Difficulty
    skillId: str
    careerId: str | None = None


class RejectedBefore(Contract):
    reason: str | None = None
    text: str | None = None
    moveIds: list[str] = Field(default_factory=list)


class Selection(Contract):
    step: int
    position: int
    rerollIndex: int = 0
    msSinceShown: int | None = None
    shownMoveIds: list[str] = Field(default_factory=list)
    rejectedBefore: list[RejectedBefore] = Field(default_factory=list)


class Provenance(Contract):
    provider: str | None = None
    model: str | None = None
    promptVersion: str | None = None
    latencyMs: int | None = None
    tried: list[str] = Field(default_factory=list)


class SelectedMove(Contract):
    schemaVersion: Literal["0.1"] = "0.1"
    selectedMoveId: str
    userId: str
    wishId: str
    selectedAt: datetime
    status: SelectedMoveStatus
    profileVersion: int | None = None
    wish: WishSnapshot
    move: Move
    selection: Selection
    provenance: Provenance


# ---- GrowthState v0.1 with Unlocks (Module 3) ------------------------------------------------------------------
class Totals(Contract):
    validated: float
    pending: float
    effortRaw: float
    effortCounted: float
    effortBanked: float
    impact: float


class Gate(Contract):
    rule: str
    met: bool


class SkillState(Contract):
    skillId: str
    name: str
    core: bool
    points: float
    pendingPoints: float
    tier: Tier
    nextTier: Tier | None
    nextThreshold: int | None
    progress: float
    gates: list[Gate] = Field(default_factory=list)


class Unlock(Contract):
    opportunityId: str
    title: str
    tier: Tier
    kind: Literal["real", "seeded", "flag", "display"]
    description: str = ""
    unlockedAt: datetime | None = None


class Outcome(Contract):
    evidenceId: str
    selectedMoveId: str
    skillId: str
    status: str
    aiScore: float | None = None
    finalQuality: float | None = None
    points: float | None = None
    feedbackSummary: str | None = None
    buddyComment: str | None = None
    peerConfirmed: bool | None = None


class Badge(Contract):
    id: str
    name: str
    rarity: str
    description: str
    earned: bool


class GrowthState(Contract):
    schemaVersion: Literal["0.1"] = "0.1"
    userId: str
    careerId: str | None
    rulesVersion: str
    catalogVersion: str
    totals: Totals
    roleTier: Tier
    skills: list[SkillState]
    unlocks: list[Unlock]
    lockedOpportunities: list[Unlock] = Field(default_factory=list)
    badges: list[Badge] = Field(default_factory=list)
    recentOutcomes: list[Outcome]
    computedAt: datetime


# ---- SocialEvidence v0.1 (Module 4) ----------------------------------------------------------------------------
class SocialEvidence(Contract):
    schemaVersion: Literal["0.1"] = "0.1"
    id: str
    invitationId: str
    evidenceId: str
    selectedMoveId: str
    ownerId: str
    reviewerId: str
    reviewerRole: Literal["reviewer", "tester"]
    reviewerTier: Literal["Proficient", "Demonstrated", "Verified", "Mentor"]
    rating: int | None = Field(default=None, ge=1, le=5)
    confirmed: bool | None = None
    comment: str = Field(default="", max_length=1000)
    countsTowardPoints: bool
    createdAt: datetime


# ---- Feed (Module 5) -------------------------------------------------------------------------------------------
class FeedItem(Contract):
    schemaVersion: Literal["0.1"] = "0.1"
    id: str
    userId: str
    category: Category
    kind: str
    title: str
    body: str
    link: str | None
    sourceModule: Literal["profile", "wish", "growth", "social", "feed"]
    sourceId: str | None
    createdAt: datetime
    readAt: datetime | None


class WhileYouWereAway(Contract):
    count: int
    byCategory: dict[str, int]
    items: list[FeedItem]


class EventContext(Contract):
    schemaVersion: Literal["0.1"] = "0.1"
    userId: str
    lastSeenAt: datetime | None
    previousSeenAt: datetime | None
    whileYouWereAway: WhileYouWereAway
    external: list[dict] = Field(default_factory=list)


class BestNextMoveTrigger(Contract):
    schemaVersion: Literal["0.1"] = "0.1"
    kind: Literal["review_requested", "revise_evidence", "submit_evidence", "invite_buddy", "await_buddy",
                  "next_move_ready", "start_wish", "complete_profile", "none"]
    reason: str
    priority: int
    link: str | None
    refs: dict[str, str] = Field(default_factory=dict)


ALL = {
    "professional_state": ProfessionalState, "selected_move": SelectedMove, "growth_state": GrowthState,
    "social_evidence": SocialEvidence, "feed_item": FeedItem, "event_context": EventContext,
    "best_next_move": BestNextMoveTrigger,
}
