"""Strategy classes for decisions that change behaviour (not just a number). Each docstring starts with its decision id
(docs/MODULE_OWNER_DECISIONS.md). Business code calls the getters at the bottom, never compares policy strings."""
from dataclasses import dataclass
from typing import Literal, Protocol

from . import loader
from .scoring.rules import RULES, TIER_ORDER, ScoringRules


# ---- D-13 / D-18: how evidence is validated ---------------------------------------------------------------------
class ValidationStrategy(Protocol):
    name: str

    def after_rubric(self) -> Literal["provisional", "final", "wait"]:
        """What the rubric score does on its own."""

    def review_finalizes(self) -> bool:
        """Whether a counting buddy review finalises the points."""

    def timeout_finalizes(self) -> bool:
        """Whether evidence finalises on the rubric alone after BUDDY_TIMEOUT_DAYS without a review."""


class AiThenBuddy:
    """D-13 ai_then_buddy: the rubric gives pending points; the buddy's rating and confirmation finalise them with the
    rubric + reviewer blend; after BUDDY_TIMEOUT_DAYS without a review the rubric alone finalises (D-18)."""
    name = "ai_then_buddy"

    def after_rubric(self):
        return "provisional"

    def review_finalizes(self):
        return True

    def timeout_finalizes(self):
        return True


class AiOnly:
    """D-13 ai_only: the rubric score alone is final; buddy feedback is shown but doesn't change points."""
    name = "ai_only"

    def after_rubric(self):
        return "final"

    def review_finalizes(self):
        return False

    def timeout_finalizes(self):
        return False


class BuddyRequired:
    """D-13 buddy_required: no points until a buddy reviews; the rubric only gives written feedback. No timeout."""
    name = "buddy_required"

    def after_rubric(self):
        return "wait"

    def review_finalizes(self):
        return True

    def timeout_finalizes(self):
        return False


VALIDATION = {s.name: s for s in (AiThenBuddy(), AiOnly(), BuddyRequired())}


# ---- D-25: unlock matching ---------------------------------------------------------------------------------------
def tier_rank(tier: str) -> int:
    return TIER_ORDER.index(tier) + 1 if tier in TIER_ORDER else 0


class AtLeast:
    """D-25 at_least: an opportunity unlocks when any skill's tier is at or above the opportunity's tier."""
    name = "at_least"

    def unlocks(self, skill_tiers: list[str], opportunity_tier: str) -> bool:
        return any(tier_rank(t) >= tier_rank(opportunity_tier) for t in skill_tiers)


class Exact:
    """D-25 exact: Growth-Validation's original: only a skill exactly at the opportunity's tier unlocks it."""
    name = "exact"

    def unlocks(self, skill_tiers: list[str], opportunity_tier: str) -> bool:
        return opportunity_tier in skill_tiers


UNLOCK = {s.name: s for s in (AtLeast(), Exact())}


# ---- D-21: effort ------------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class EffortRule:
    """D-21: per_move_once = effort once per selected move and never for failed scoring; per_submission = every
    submission (Growth-Validation original)."""
    name: str

    def once_per_move(self) -> bool:
        return self.name == "per_move_once"


# ---- getters -----------------------------------------------------------------------------------------------------
def validation() -> ValidationStrategy:
    return VALIDATION[loader.get("VALIDATION_MODE")]


def unlock_match():
    return UNLOCK[loader.get("UNLOCK_MATCH")]


def scoring_rules() -> ScoringRules:
    return RULES[loader.get("SCORING_RULES")]


def effort_rule() -> EffortRule:
    return EffortRule(loader.get("EFFORT_RULE"))
