"""Growth-Validation's test_scoring.py (@ c657bab), ported verbatim against ScoringRules v1.0, plus the worked
examples in docs/SCORING.md and the v1.0 -> v1.1 differences."""
from app.modules.growth import scoring
from app.modules.growth.scoring import SkillFacts
from app.policies.scoring.rules import V1_0, V1_1
from app.policies.strategies import AtLeast, Exact

BASE, DIFFICULTY = V1_0.base, V1_0.difficulty


# ---- Growth-Validation's original three tests -------------------------------------------------------------------
def test_base_values_match_spec():
    assert BASE == {"explore": 10, "create": 20, "test": 20, "share": 15, "connect": 10, "enable": 10}


def test_difficulty_values_match_spec():
    assert DIFFICULTY == {"easy": 1.0, "moderate": 1.5, "hard": 2.0}


def test_decay_sequence():
    vals = [max(.2, .7 ** (n - 1)) for n in range(1, 8)]
    assert [round(x, 2) for x in vals] == [1, .7, .49, .34, .24, .2, .2]
    assert [round(scoring.decay(n, V1_1), 2) for n in range(1, 8)] == [1, .7, .49, .34, .24, .2, .2]


# ---- docs/SCORING.md worked examples (v1.1) ---------------------------------------------------------------------
def test_example_easy_explore_confident_rubric():
    a = (0.9 + 0.7 + 0.8 + 0.8) / 4
    r = scoring.reviewer_score([("Proficient", 4)], V1_1)
    q = scoring.quality(a, 0.9, r, V1_1)
    assert round(r, 2) == 0.75 and round(q, 2) == 0.77
    assert scoring.points("explore", "easy", q, 1, V1_1) == 7.70
    assert scoring.points("explore", "easy", a, 1, V1_1) == 8.00  # pending before review


def test_example_hard_create_low_confidence():
    q = scoring.quality(0.90, 0.4, scoring.reviewer_score([("Proficient", 3)], V1_1), V1_1)
    assert round(q, 2) == 0.58 and scoring.points("create", "hard", q, 1, V1_1) == 23.20
    q2 = scoring.quality(0.90, 0.4, scoring.reviewer_score([("Proficient", 2)], V1_1), V1_1)
    assert round(q2, 2) == 0.38 and q2 < V1_1.pass_bar  # needs work


def test_example_decayed_repeat():
    q = scoring.quality(0.70, 0.8, scoring.reviewer_score([("Demonstrated", 4)], V1_1), V1_1)
    assert round(q, 2) == 0.73 and scoring.points("test", "moderate", q, 3, V1_1) == 10.73


def test_impact_effort_ceiling():
    assert scoring.totals(70, 30, V1_1) == (30, 0, 100)
    assert scoring.totals(14, 30, V1_1) == (30, 0, 44)
    assert scoring.totals(140, 30, V1_1) == (30, 0, 170)
    assert scoring.totals(0, 45, V1_1) == (30, 15, 30)


def test_effort_weekly_cap():
    assert scoring.effort_allowed(3, 0, V1_1) == 3
    assert scoring.effort_allowed(3, 19, V1_1) == 1
    assert scoring.effort_allowed(3, 20, V1_1) == 0


def test_weighted_reviewers():
    r = scoring.reviewer_score([("Proficient", 5), ("Verified", 1)], V1_1)
    assert round(r, 4) == round((0.8 * 1 + 1.2 * 0) / 2.0, 4)


def test_difficulty_adjusts_one_level():
    assert scoring.adjust_difficulty("easy", "hard", True) == "moderate"
    assert scoring.adjust_difficulty("hard", "easy", True) == "moderate"
    assert scoring.adjust_difficulty("easy", "hard", False) == "easy"


# ---- tiers: v1.0 exactly as Growth-Validation, v1.1 checks gates in order ----------------------------------------
def test_proficient_needs_two_items_both_versions():
    f = SkillFacts(validated_items=1)
    assert scoring.skill_tier(f, 120, V1_0, "admin_endorsement") == "Familiar"
    assert scoring.skill_tier(f, 120, V1_1, "admin_endorsement") == "Familiar"


def test_demonstrated_without_hard_or_senior():
    f = SkillFacts(validated_items=3, has_hard=True, has_senior_reviewer=False)
    assert scoring.skill_tier(f, 300, V1_0, "admin_endorsement") == "Proficient"
    assert scoring.skill_tier(f, 300, V1_1, "admin_endorsement") == "Proficient"


def test_v10_bug_demonstrated_downgrade_skips_two_item_check():
    f = SkillFacts(validated_items=1, has_hard=False)
    assert scoring.skill_tier(f, 300, V1_0, "admin_endorsement") == "Proficient"   # original behaviour
    assert scoring.skill_tier(f, 300, V1_1, "admin_endorsement") == "Familiar"     # fixed


def test_v10_bug_verified_cap_skips_demonstrated_gates():
    f = SkillFacts(validated_items=1, has_hard=False, has_senior_reviewer=False)
    assert scoring.skill_tier(f, 600, V1_0, "admin_endorsement") == "Demonstrated"  # original behaviour
    assert scoring.skill_tier(f, 600, V1_1, "admin_endorsement") == "Familiar"      # fixed


def test_verified_needs_endorsement_unless_points():
    f = SkillFacts(validated_items=5, has_hard=True, has_senior_reviewer=True)
    assert scoring.skill_tier(f, 600, V1_1, "admin_endorsement") == "Demonstrated"
    assert scoring.skill_tier(SkillFacts(5, 0, 5, True, True, True), 600, V1_1, "admin_endorsement") == "Verified"
    assert scoring.skill_tier(f, 600, V1_1, "points") == "Verified"


def test_role_tier():
    assert scoring.role_tier(["Proficient", "Proficient", "Familiar", "Not started"], V1_1) == "Familiar"
    assert scoring.role_tier(["Proficient", "Proficient", "Proficient", "Familiar"], V1_1) == "Proficient"
    assert scoring.role_tier([], V1_1) == "Not started"


def test_unlock_match_at_least_vs_exact():
    assert AtLeast().unlocks(["Demonstrated"], "Proficient") is True
    assert Exact().unlocks(["Demonstrated"], "Proficient") is False
    assert Exact().unlocks(["Proficient"], "Proficient") is True
