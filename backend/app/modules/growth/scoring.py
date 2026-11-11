"""Growth-Validation's scoring (scoring.py @ c657bab) as pure functions over plain data, parameterised by a
ScoringRules version (docs/SCORING.md). No database access here, so every rule is unit-tested directly."""
import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from ...policies.scoring.rules import TIER_ORDER, ScoringRules

NOT_STARTED = "Not started"


def rank(tier: str) -> int:
    return TIER_ORDER.index(tier) + 1 if tier in TIER_ORDER else 0


# ---- per evidence ----------------------------------------------------------------------------------------------
def reviewer_score(reviews: list[tuple[str, int]], rules: ScoringRules) -> float | None:
    """r = Σ w·((rating-1)/4) / Σ w, with w from the reviewer's tier. None when there are no counting reviews."""
    if not reviews:
        return None
    ws = [(rules.reviewer_weights.get(t, 1.0), (rating - 1) / 4) for t, rating in reviews]
    return sum(w * s for w, s in ws) / sum(w for w, _ in ws)


def quality(ai: float, confidence: float, reviewer: float | None, rules: ScoringRules) -> float:
    """q = .2a + .8r when confidence < .5, else .4a + .6r; the rubric alone when there is no reviewer (D-15)."""
    if reviewer is None:
        return ai
    wa, wr = rules.blend_low if confidence < rules.low_confidence else rules.blend_high
    return wa * ai + wr * reviewer


def decay(n: int, rules: ScoringRules, enabled: bool = True) -> float:
    """n = 1 + validated items with the same skill and activity type in the last 30 days (D-22)."""
    return max(rules.decay_floor, rules.decay_rate ** (n - 1)) if enabled else 1.0


def points(activity: str, difficulty: str, q: float, n: int, rules: ScoringRules, decay_enabled: bool = True) -> float:
    base = rules.base.get(activity, rules.base_default)
    mult = rules.difficulty.get(difficulty, rules.difficulty_default)
    return round(base * mult * q * decay(n, rules, decay_enabled), 2)


def adjust_difficulty(tagged: str, suggested: str | None, enabled: bool) -> str:
    """The rubric may move difficulty by at most one level (D-12, Growth-Validation main.py)."""
    order = ["easy", "moderate", "hard"]
    if not enabled or suggested not in order or tagged not in order:
        return tagged
    a, b = order.index(tagged), order.index(suggested)
    return order[a + max(-1, min(1, b - a))]


def effort_allowed(requested: int, used_this_week: float, rules: ScoringRules) -> int:
    return int(max(0, min(requested, rules.effort_weekly_cap - used_this_week)))


def iso_week(dt: datetime) -> str:
    return dt.strftime("%G-W%V")


def totals(validated: float, effort: float, rules: ScoringRules) -> tuple[float, float, float]:
    """(effortCounted, effortBanked, impact): effort counts up to max(30, 3/7·validated) (D-20)."""
    ceiling = max(rules.effort_floor, rules.effort_ratio * validated)
    counted = min(effort, ceiling)
    return round(counted, 2), round(max(0.0, effort - counted), 2), round(validated + counted, 2)


# ---- per skill -------------------------------------------------------------------------------------------------
@dataclass
class SkillFacts:
    points: float = 0.0
    pending: float = 0.0
    validated_items: int = 0
    has_hard: bool = False
    has_senior_reviewer: bool = False
    endorsed: bool = False


def _gate_met(tier: str, f: SkillFacts, rules: ScoringRules, verified_requires: str) -> bool:
    if tier == "Proficient":
        return f.validated_items >= rules.proficient_min_items
    if tier == "Demonstrated":
        return f.has_hard and f.has_senior_reviewer
    if tier == "Verified":
        return verified_requires == "points" or f.endorsed
    return True


def skill_tier(f: SkillFacts, pts: float, rules: ScoringRules, verified_requires: str) -> str:
    reached = NOT_STARTED
    for t in TIER_ORDER:
        if pts >= rules.thresholds[t]:
            reached = t
    if not rules.gates_in_order:
        # v1.0, Growth-Validation exactly: each check looks only at the tier reached, then caps without re-checking.
        tier = reached
        if tier == "Proficient" and not _gate_met("Proficient", f, rules, verified_requires):
            tier = "Familiar"
        if tier == "Demonstrated" and not _gate_met("Demonstrated", f, rules, verified_requires):
            tier = "Proficient"
        if tier == "Verified" and not _gate_met("Verified", f, rules, verified_requires):
            tier = "Demonstrated"
        return tier
    # v1.1: a tier needs its own gate and every lower one (D-23).
    tier = reached
    while tier != NOT_STARTED and not all(_gate_met(t, f, rules, verified_requires) for t in TIER_ORDER[: rank(tier)]):
        tier = TIER_ORDER[rank(tier) - 2] if rank(tier) > 1 else NOT_STARTED
    return tier


def gates_for(next_tier: str | None, f: SkillFacts, pts: float, rules: ScoringRules, verified_requires: str) -> list[dict]:
    if not next_tier:
        return []
    out = [{"rule": f"{rules.thresholds[next_tier]} points", "met": pts >= rules.thresholds[next_tier]}]
    if next_tier in ("Proficient", "Demonstrated", "Verified") and rules.gates_in_order or next_tier == "Proficient":
        out.append({"rule": f"{rules.proficient_min_items} validated items", "met": f.validated_items >= rules.proficient_min_items})
    if next_tier in ("Demonstrated", "Verified"):
        out.append({"rule": "a validated hard item", "met": f.has_hard})
        out.append({"rule": "a reviewer at Demonstrated or above", "met": f.has_senior_reviewer})
    if next_tier == "Verified" and verified_requires == "admin_endorsement":
        out.append({"rule": "an endorsement", "met": f.endorsed})
    return out


def role_tier(core_tiers: list[str], rules: ScoringRules) -> str:
    """Highest tier reached by at least ceil(60%) of core skills (D-28)."""
    if not core_tiers:
        return NOT_STARTED
    need = math.ceil(rules.role_ratio * len(core_tiers))
    result = NOT_STARTED
    for t in TIER_ORDER:
        if sum(1 for x in core_tiers if rank(x) >= rank(t)) >= need:
            result = t
    return result


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")[:40] or "skill"


@dataclass
class GrowthInputs:
    """Everything compute_growth_state needs, loaded by the service in one go."""
    user_id: str
    career: dict | None
    freeform_skills: list[str]
    ledger: list[dict]          # {kind, points, skill_id, evidence_id, created_at}
    evidence: list[dict]        # {id, skill_id, activity_type, difficulty_final|difficulty, status, ...}
    senior_by_evidence: dict    # evidence_id -> bool (any counting reviewer at Demonstrated+)
    endorsed_skills: set
    unlocked: dict              # opportunity_id -> unlocked_at
    opportunities: list[dict]
    outcomes: list[dict] = field(default_factory=list)


def compute(inp: GrowthInputs, rules: ScoringRules, *, provisional_counts: bool, verified_requires: str, unlock_match) -> dict:
    """Pure GrowthState body (without schemaVersion/userId wrappers). Reads never write (T-14)."""
    if inp.career:
        skill_defs = inp.career["skills"]
    else:
        skill_defs = [{"id": slug(s), "name": s, "core": False} for s in inp.freeform_skills]
    finalized = {e["id"] for e in inp.evidence if e["status"] in ("validated", "needs_work")}
    validated_total = sum(float(r["points"]) for r in inp.ledger if r["kind"] in ("validated", "reversal"))
    effort_total = sum(float(r["points"]) for r in inp.ledger if r["kind"] == "effort")
    pending_total = sum(float(r["points"]) for r in inp.ledger
                        if r["kind"] == "provisional" and r["evidence_id"] not in finalized)
    counted, banked, impact = totals(validated_total, effort_total, rules)

    skills = []
    for s in skill_defs:
        f = SkillFacts()
        f.points = sum(float(r["points"]) for r in inp.ledger if r["kind"] in ("validated", "reversal") and r["skill_id"] == s["id"])
        f.pending = sum(float(r["points"]) for r in inp.ledger if r["kind"] == "provisional" and r["skill_id"] == s["id"]
                        and r["evidence_id"] not in finalized)
        ev = [e for e in inp.evidence if e["skill_id"] == s["id"] and e["status"] == "validated"]
        f.validated_items = len(ev)
        f.has_hard = any((e.get("difficulty_final") or e["difficulty"]) == "hard" for e in ev)
        f.has_senior_reviewer = any(inp.senior_by_evidence.get(e["id"]) for e in ev)
        f.endorsed = s["id"] in inp.endorsed_skills
        pts = f.points + (f.pending if provisional_counts else 0)
        tier = skill_tier(f, pts, rules, verified_requires)
        nxt = TIER_ORDER[rank(tier)] if rank(tier) < len(TIER_ORDER) else None
        nthr = rules.thresholds[nxt] if nxt else None
        skills.append({
            "skillId": s["id"], "name": s["name"], "core": bool(s.get("core")), "points": round(f.points, 2),
            "pendingPoints": round(f.pending, 2), "tier": tier, "nextTier": nxt, "nextThreshold": nthr,
            "progress": round(min(1.0, pts / nthr), 3) if nthr else 1.0,
            "gates": gates_for(nxt, f, pts, rules, verified_requires),
        })

    tiers = [s["tier"] for s in skills]
    core = [s["tier"] for s in skills if s["core"]]
    unlocks, locked = [], []
    for op in inp.opportunities:
        item = {"opportunityId": op["id"], "title": op["name"], "tier": op["tier"], "kind": op["kind"],
                "description": op.get("description", "")}
        if op["id"] in inp.unlocked:
            unlocks.append({**item, "unlockedAt": inp.unlocked[op["id"]]})
        elif unlock_match.unlocks(tiers, op["tier"]):
            unlocks.append({**item, "unlockedAt": None})  # earned; saved when evidence is finalised
        else:
            locked.append(item)

    any_validated = any(e["status"] == "validated" for e in inp.evidence)
    badges = [
        {"id": "first-evidence", "name": "First Steps", "rarity": "Common", "description": "Submit your first evidence.",
         "earned": bool(inp.evidence)},
        {"id": "consistent", "name": "Consistent Contributor", "rarity": "Rare", "description": "Earn 20 effort points.",
         "earned": effort_total >= 20},
        {"id": "builder", "name": "Project Builder", "rarity": "Uncommon", "description": "Validate a create move.",
         "earned": any(e["status"] == "validated" and e["activity_type"] == "create" for e in inp.evidence)},
        {"id": "reviewed", "name": "Evidence Validated", "rarity": "Uncommon", "description": "Get evidence validated.",
         "earned": any_validated},
    ]
    return {
        "careerId": inp.career["id"] if inp.career else None,
        "rulesVersion": rules.version,
        "totals": {"validated": round(validated_total, 2), "pending": round(pending_total, 2), "effortRaw": round(effort_total, 2),
                   "effortCounted": counted, "effortBanked": banked, "impact": impact},
        "roleTier": role_tier(core, rules) if inp.career else NOT_STARTED,
        "skills": skills, "unlocks": unlocks, "lockedOpportunities": locked, "badges": badges,
        "recentOutcomes": inp.outcomes,
        "computedAt": datetime.now(timezone.utc),
    }


def recent_count(evidence: list[dict], skill_id: str, activity: str, exclude_id: str, rules: ScoringRules,
                 now: datetime | None = None) -> int:
    """n for decay: 1 + validated items with the same skill and activity type finalised in the last 30 days."""
    now = now or datetime.now(timezone.utc)
    since = now - timedelta(days=rules.decay_window_days)
    prior = [e for e in evidence if e["id"] != exclude_id and e["status"] == "validated" and e["skill_id"] == skill_id
             and e["activity_type"] == activity and (e.get("finalized_at") or e["created_at"]) >= since]
    return len(prior) + 1
