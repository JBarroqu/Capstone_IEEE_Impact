"""D-15, D-16, D-20, D-22, D-23, D-28: Growth-Validation's scoring constants (scoring.py @ c657bab), versioned.
v1.0 is the original exactly; v1.1 differs only in how tier gates are checked (gates_in_order). docs/SCORING.md."""
from dataclasses import dataclass, field

TIER_ORDER = ("Familiar", "Proficient", "Demonstrated", "Verified")


@dataclass(frozen=True)
class ScoringRules:
    version: str
    base: dict = field(default_factory=lambda: {"explore": 10, "create": 20, "test": 20, "share": 15, "connect": 10, "enable": 10})
    base_default: float = 10
    difficulty: dict = field(default_factory=lambda: {"easy": 1.0, "moderate": 1.5, "hard": 2.0})
    difficulty_default: float = 1.5
    thresholds: dict = field(default_factory=lambda: {"Familiar": 30, "Proficient": 100, "Demonstrated": 250, "Verified": 500})
    reviewer_weights: dict = field(default_factory=lambda: {"Proficient": 0.8, "Demonstrated": 1.0, "Verified": 1.2, "Mentor": 1.2})
    low_confidence: float = 0.5
    blend_low: tuple = (0.2, 0.8)   # (ai, reviewer) when confidence < low_confidence
    blend_high: tuple = (0.4, 0.6)
    pass_bar: float = 0.5
    decay_rate: float = 0.7
    decay_floor: float = 0.2
    decay_window_days: int = 30
    effort_points: int = 3
    effort_weekly_cap: int = 20
    effort_floor: float = 30.0
    effort_ratio: float = 3 / 7
    role_ratio: float = 0.6
    proficient_min_items: int = 2
    senior_reviewer_tiers: tuple = ("Demonstrated", "Verified", "Mentor")
    # v1.0 caps Verified to Demonstrated and downgrades Demonstrated to Proficient without re-checking lower gates.
    gates_in_order: bool = True


V1_0 = ScoringRules(version="1.0", gates_in_order=False)
V1_1 = ScoringRules(version="1.1", gates_in_order=True)
RULES = {"v1.0": V1_0, "v1.1": V1_1}
