# Scoring

Owner: Christina Phan (Module 3).

Every formula and constant here comes from the `Growth-Validation` branch (`scoring.py`, `ai.py`, `main.py`), unless it is marked as a fix. They live in one versioned `ScoringRules` object in `backend/app/policies/scoring/`:
- **v1.0** is Growth-Validation exactly. It is kept so its tests keep passing.
- **v1.1** is the integration default.

Both are selectable with `SCORING_RULES` (D-15).

## Constants (both versions)

```
BASE        = {explore: 10, create: 20, test: 20, share: 15, connect: 10, enable: 10}
DIFFICULTY  = {easy: 1.0, moderate: 1.5, hard: 2.0}
THRESHOLDS  = {Familiar: 30, Proficient: 100, Demonstrated: 250, Verified: 500}
REVIEWER_W  = {Proficient: 0.8, Demonstrated: 1.0, Verified: 1.2, Mentor: 1.2}
PASS_BAR    = 0.5
DECAY       = max(0.2, 0.7 ** (n - 1))   n = 1 + validated items with same skill and activity type in last 30 days
EFFORT      = 3 per move, max 20 per ISO week
ROLE_RATIO  = 0.6 of core skills
RUBRIC      = relevance, completeness, quality, clarity, each 0..1; overall = mean; temperature 0
```

## Step by step

1. **Rubric score `a`.** The rubric (D-48) returns four criteria between 0 and 1. `a` is their mean. Any `overall_score` the model sends itself is ignored.
   - It also returns a `confidence` and a `suggested_difficulty`. The difficulty may move one level from the move's own tag (D-12).
2. **Reviewer score `r`.** A weighted mean of the reviewers' ratings, mapped from 1–5 onto 0–1: `r = Σ w·((rating−1)/4) / Σ w`. The weight `w` comes from `REVIEWER_W[reviewer tier]` (D-14).
3. **Quality `q`** (D-15):
   - `q = 0.2a + 0.8r` when confidence < 0.5;
   - `q = 0.4a + 0.6r` otherwise;
   - `q = a` when there is no reviewer (`ai_only`, or the 7-day timeout D-18).
4. **Pass bar.** `q < 0.5` means **needs work**, with 0 validated points (D-16).
5. **Points:** `round(BASE[type] × DIFFICULTY[difficulty] × q × DECAY, 2)`.
6. **Pending points.** With `ai_then_buddy`, step 5 is first computed with `q = a` and written to the ledger as `provisional`. When the buddy confirms (or the timeout passes), a `validated` row is written with the final `q`, and the provisional row is no longer counted.
7. **Impact Score** (D-20):
   - `counted effort = min(effort, max(30, 3/7 × validated))`
   - `banked effort = effort − counted effort`
   - `impact = validated + counted effort`

   So effort is at most about 30% of the score, with a 30-point starter allowance.
8. **Tiers** (D-23), per skill:
   - The tier is the highest threshold reached by validated points (plus pending points if `PROVISIONAL_COUNTS=true`).
   - Then the gates apply:
     - Proficient needs ≥ 2 validated items in that skill.
     - Demonstrated needs a validated `hard` item and at least one reviewer at Demonstrated, Verified or Mentor.
     - Verified needs an admin endorsement (D-24).
   - A skill that fails a gate drops to the highest tier whose gates it meets.
9. **Role tier** (D-28): the highest tier reached by at least `ceil(0.6 × number of core skills)` core skills.
10. **Unlocks** (D-25): an opportunity unlocks when any skill's tier is **at least** the opportunity's tier. Unlocks are never revoked (D-26).
11. **Badges.** Growth-Validation's four badges are computed on read:
    - First Steps: any evidence.
    - Consistent Contributor: effort ≥ 20.
    - Project Builder: a validated `create`.
    - Evidence Validated: any validated item.

## Worked examples (v1.1, `ai_then_buddy`)

**1. Easy explore, confident rubric, Proficient reviewer.**
- Rubric criteria 0.9 / 0.7 / 0.8 / 0.8, so `a = 0.80`; confidence 0.9.
- Reviewer rating 4, so `r = 0.75`.
- `q = 0.4×0.80 + 0.6×0.75 = 0.77`. Passes.
- First explore in this skill, so decay 1.0.
- Points = 10 × 1.0 × 0.77 × 1.0 = **7.70**.
- Pending before review: 10 × 1.0 × 0.80 = 8.00.

**2. Hard create, low rubric confidence (a video link the model can't open).**
- `a = 0.90`, confidence 0.4. Reviewer rating 3, so `r = 0.50`.
- Low confidence leans on the reviewer: `q = 0.2×0.90 + 0.8×0.50 = 0.58`. Passes.
- Points = 20 × 2.0 × 0.58 × 1.0 = **23.20**.
- With rating 2 (`r = 0.25`): `q = 0.38`, which is **needs work**, 0 points.

**3. Third moderate test of the same skill in 30 days.**
- `a = 0.70`, confidence 0.8. Rating 4, so `r = 0.75`.
- `q = 0.4×0.70 + 0.6×0.75 = 0.73`. n = 3, so decay = 0.7² = 0.49.
- Points = 20 × 1.5 × 0.73 × 0.49 = **10.73**.

**Impact.**
- Validated 70, effort 30: ceiling = max(30, 30) = 30, so counted 30, impact **100**.
- Validated 14, effort 30: ceiling = max(30, 6) = 30, so impact **44**.
- Validated 140, effort 30: ceiling 60, so all 30 effort counts, impact **170**.

## v1.0 → v1.1 differences

| Rule | v1.0 (Growth-Validation) | v1.1 (default) | Why |
|---|---|---|---|
| Reviewers | Simulated: a fixed name picked by `evidence.id % 3`, rating copied from the rubric | Real buddy reviews via SocialEvidence (D-13) | Simulated reviews only repeated the rubric score |
| Verified cap | 500+ points capped to Demonstrated **without** checking the Demonstrated gates | Gates checked in order; Verified needs an endorsement | Bug: 500 points skipped the hard-item and senior-reviewer checks |
| Proficient gate after a Demonstrated downgrade | The 2-item check was skipped | Every lower gate is checked | Bug |
| Scoring inputs | Type, difficulty and skill chosen by the user on the form | Read from the selected move, tagged by the model (D-11) | Users could claim `create`/`hard` for anything |
| Effort | Per submission, including failed ones (D-21 policy) | Once per move | Farming |
| Unlock match | Exact tier (D-25 policy) | At least the tier | Bug: Proficient unlocks were skipped at Demonstrated |

The last two are policies, so they can be set back to v1.0 behaviour independently of `SCORING_RULES`.

## Tests

- **Ported:** Growth-Validation's `test_scoring.py` runs against v1.0 unchanged.
- **New:**
  - one test per rule above for both versions;
  - the worked examples as exact numbers;
  - effort cap and ceiling;
  - decay sequence;
  - gate downgrades;
  - at_least vs exact unlocks;
  - every `VALIDATION_MODE` × timeout combination.
