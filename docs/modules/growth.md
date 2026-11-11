# Module 3: Activity, Evidence & Growth Feedback

**Owner:** Christina Phan.
**Source:** branch `Growth-Validation` @ `c657bab`. The source of truth is the `backend/app/` and `frontend/` layout inside `ieee-impact-plus-main.zip`; the root files are the same code flattened.
**Code:** `backend/app/modules/growth/`, `backend/app/policies/scoring/`, `data/catalog.json`, `frontend/src/modules/growth/`.

## What the branch had
- FastAPI + SQLAlchemy with its own email/password auth (bcrypt, 7-day JWT) and integer user ids.
- A career catalog: data analyst, software engineer, UX designer and cybersecurity, each with a skill list and core flags.
- 7 hand-written moves, all for data analysts.
- 7 opportunities with tiers.
- Evidence submission (link, file or text). PDF, DOCX and TXT text is extracted.
- A Gemini rubric (relevance, completeness, quality, clarity) with retries.
- **Simulated** peer reviewers.
- A points ledger with effort (weekly cap) and validated points, decay, tiers with gates, role tier, unlocks and computed badges.
- A vanilla-JS frontend: home, career, moves, evidence, reviews, score, badges, opportunities.

## What we kept
- **All the scoring math and constants, unchanged.** They are written out in `SCORING.md` and kept as `ScoringRules v1.0`.
- The rubric prompt and its safeguards, the text extraction, retry on model errors and the `ai_error` status.
- The career → skills catalog and the opportunities, moved to `data/catalog.json`.
- The append-only ledger design (`score_events` with `rules_version`).
- The four badges.
- The `/integrations/growth-state` idea, now the GrowthState v0.1 contract with unlocks added.

## What we changed, and why

| Change | Why | Decision |
|---|---|---|
| Evidence belongs to a **SelectedMove** from the Wish Engine | The pipeline: Module 2's output is Module 3's input | D-32, CONTRACTS |
| Skill, activity type and difficulty come from the move, not the form | Users could claim `create`/`hard` for anything | D-11 |
| Static moves catalog dropped | Every move is generated; the catalog only covered one career | D-29 |
| Simulated reviewers replaced by real buddy reviews (SocialEvidence) | The simulated rating copied the rubric score, so it added nothing | D-13 |
| The rubric gives **pending** points; a buddy's confirmation finalises them; 7-day timeout | The team's chosen validation flow | D-13, D-17, D-18 |
| Effort once per move, none for failed scoring | Resubmitting farmed effort | D-21 |
| Unlock at **at least** the tier | The exact-tier match skipped lower unlocks | D-25 |
| Tier gates checked in order; Verified needs an admin endorsement | 500 points skipped the Demonstrated checks | D-23, D-24, SCORING |
| Reads never write | `GET /dashboard` wrote unlocks on every view | T-14 |
| The rubric's criteria keys are fixed; everything is rendered as text | Model-chosen keys were inserted into the page as HTML (XSS) | SECURITY |
| The rubric runs on the shared model chain | One model setup with failover for the whole app | T-10 |
| Files go to private Supabase Storage | Local `uploads/` is wiped on every Render restart | T-09 |
| Own auth and `users` table removed | One auth | T-04 |

## How other modules use it (`growth/api.py`)
- `get_growth_state(user_id) -> GrowthState`
- `allowed_skills(user_id) -> list[Skill]`: the target career's skills, used for move tags (D-08)
- `recent_outcomes(user_id, wish_id) -> list[Outcome]`: next-move context (D-07)
- `apply_social_evidence(se: SocialEvidence)`: called by Module 4

It publishes `EvidenceSubmitted`, `EvidenceScored`, `EvidenceValidated`, `EvidenceNeedsWork`, `TierReached` and `UnlockGranted`.

## Policies that affect this module
- `VALIDATION_MODE` (D-13)
- `BUDDY_TIMEOUT_DAYS` (D-18)
- `BUDDY_TIER_SOURCE` (D-14)
- `SCORING_RULES` (D-15, D-16, D-20, D-22, D-23, D-28)
- `PROVISIONAL_COUNTS` (D-17)
- `EFFORT_RULE` (D-21)
- `DECAY_ENABLED` (D-22)
- `VERIFIED_REQUIRES` (D-24)
- `UNLOCK_MATCH` (D-25)
- `AI_DIFFICULTY_ADJUST` (D-12)
- `SKILL_MODEL` (D-08); the taxonomy itself is `data/catalog.json` (D-09)
- No setting: unlocks are never revoked (D-26); the rubric prompt is fixed at v1 in `growth/rubric.py` (D-48)

## Changing the scoring
- **Change a constant:** add a new `ScoringRules` version (e.g. `v1.2`) and select it with `SCORING_RULES`. Old points keep their version.
- **Change how validation works:** add a `ValidationStrategy` class and a value for `VALIDATION_MODE`.

## Tests
- Growth-Validation's `test_scoring.py` runs against v1.0, ported verbatim.
- About 30 pure tests of every rule in both versions, plus the worked examples in `SCORING.md`.
- The `VALIDATION_MODE` matrix.
- "GET writes nothing".
- Rubric output with unexpected keys is rejected.
