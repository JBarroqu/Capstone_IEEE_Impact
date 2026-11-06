# Contracts between modules

A contract is the exact shape of data one module hands to another. These are the `... v0.1` outputs from the backbone diagram.

**Where they live.** Contracts are pydantic models in `backend/app/contracts/`. `npm run schemas` exports them to:
- `contracts/schemas/*.json` (JSON Schema, committed);
- `frontend/src/contracts/*.ts` (TypeScript types).

A test fails if a model changes but its committed schema doesn't, unless `schemaVersion` was bumped.

**How modules use them.**
- **Inside the app:** a module gets another module's contract by calling that module's `api.py`, for example `profile.api.get_professional_state(user_id)`. Modules never read each other's tables.
- **Outside the app:** each contract is also available over HTTP at `GET /api/v1/integrations/...`. A team running its module standalone can consume the same shape.

**Versioning.**
- Every contract carries `schemaVersion`.
- **Adding** an optional field bumps the minor version (`0.1` → `0.2`).
- **Renaming or removing** a field bumps the major version.
- Contracts move to `1.0` once the producing and consuming owners agree.

**Field naming.** Fields are camelCase in JSON. Database columns are snake_case.

| Contract | Produced by | Consumed by | HTTP mirror |
|---|---|---|---|
| ProfessionalState v0.1 | profile (M1) | wish, growth, social, feed | `GET /api/v1/integrations/professional-state` |
| SelectedMove v0.1 | wish (M2) | growth, social, feed | `GET /api/v1/integrations/selected-move/{id}` |
| GrowthState v0.1 (with Unlocks) | growth (M3) | wish, feed, profile page | `GET /api/v1/integrations/growth-state` |
| SocialEvidence v0.1 | social (M4) | growth | `GET /api/v1/integrations/social-evidence/{id}` |
| FeedItem v0.1 | feed (M5) | frontend | `GET /api/v1/feed` |
| EventContext v0.1 | feed (M5) | Home | `GET /api/v1/home` |
| BestNextMoveTrigger v0.1 | feed (M5) | Home | `GET /api/v1/home` |
| Domain events v0.1 | all modules | feed (and any module that subscribes) | in-process only |

---

## ProfessionalState v0.1 (Module 1, owner Cfoley5)

Built from the `Professional-State` branch's model. Changes from that model are listed in `MODULE_OWNER_DECISIONS.md` (D-44, D-51).

| Field | Type | Notes |
|---|---|---|
| schemaVersion | `"0.1"` | |
| userId | uuid | Supabase `auth.users.id` |
| handle | string | unique, `^[a-z0-9_]{3,24}$`, used to invite buddies |
| displayName | string ≤80 | never sent to the model (D-06) |
| headline | string ≤120 | |
| bio | string ≤1000 | never sent to the model in `summary` mode |
| education | `{institution ≤120, major ≤120, gradYear? int}` | institution is never sent to the model |
| position | string ≤80 | e.g. "Student", "Intern" |
| targetCareerId | string | a career id from `data/catalog.json` (D-08) |
| skills | string[] ≤30, each ≤40 | self-reported; validated skills live in GrowthState |
| interests | string[] ≤20 | |
| strengths | string[] ≤10 | **new**, from the backbone diagram |
| growthAreas | string[] ≤10 | "directions for improvement" |
| featuredContributions | `[{id, title ≤120, type: project\|coursework\|professional\|other, description ≤1000, verificationStatus: self_reported\|verified, evidenceId?}]` ≤10 | only the server sets `verified`, when the contribution links validated evidence |
| onboardingCompletedAt | timestamp or null | |
| version | int | +1 on each save; SelectedMove records which version it was generated against |
| updatedAt | timestamp | |

```json
{
  "schemaVersion": "0.1",
  "userId": "7c1e0b9a-3f2d-4a51-9a0e-1b2c3d4e5f60",
  "handle": "sam_r",
  "displayName": "Sam Rivera",
  "headline": "CS senior building data tools",
  "bio": "I like turning messy data into dashboards.",
  "education": { "institution": "Arizona State University", "major": "Computer Science", "gradYear": 2027 },
  "position": "Student",
  "targetCareerId": "data_analyst",
  "skills": ["Python", "SQL", "pandas"],
  "interests": ["sports analytics"],
  "strengths": ["explaining results clearly"],
  "growthAreas": ["statistics", "industry experience"],
  "featuredContributions": [
    { "id": "1d2e...", "title": "Capstone sales dashboard", "type": "coursework", "description": "Power BI dashboard over a 2M-row dataset", "verificationStatus": "self_reported", "evidenceId": null }
  ],
  "onboardingCompletedAt": "2026-11-05T18:02:11Z",
  "version": 3,
  "updatedAt": "2026-11-05T18:02:11Z"
}
```

**The model's view.** The Wish Engine never sees the whole object. `profile.api.to_prompt_profile(state, mode)` returns a reduced version, controlled by D-06 `PROFILE_IN_MOVES`:
- `summary` keeps targetCareerId, major, position, skills, interests, strengths and growthAreas.
- `full` also adds headline, bio and contributions.

## SelectedMove v0.1 (Module 2, owner Waleed)

This is the Wish Engine's `selected-move.v1` proposal (`docs/wish-engine/HANDOFF.md`), with these changes:
- `participantCode` and `sessionId` are removed (users are real accounts now).
- `move` gains `activityType`, `difficulty`, `skillId` and `careerId`, which the model sets (D-11).
- `status` and `profileVersion` are added.

| Field | Type | Notes |
|---|---|---|
| schemaVersion | `"0.1"` | |
| selectedMoveId | uuid | |
| userId, wishId | uuid | |
| selectedAt | timestamp | |
| status | `active \| evidence_submitted \| awaiting_review \| validated \| needs_work \| abandoned` | growth and social update it through `wish.api` |
| profileVersion | int | the ProfessionalState version the options were generated against |
| wish | `{text, type: open_ended\|fixed, focus[], domains[], why?, priorAttempts{chips[], text?}, followUps[{question, answer, note?}]}` | |
| move | `{id, key, title, detail, step, minutes, cost: free\|paid, format, focus[], domains[], archetypeFit{}, activityType, difficulty, skillId, careerId}` | `key` = `gen-` + hash of title and step (kept for analytics) |
| selection | `{step, position, rerollIndex, msSinceShown, shownMoveIds[], rejectedBefore[{reason, text?, moveIds[]}]}` | `position` is 0-based |
| provenance | `{provider, model, promptVersion, latencyMs, tried[]}` | `tried` lists models skipped on the way |

Allowed values:
- `activityType`: `explore | create | test | share | connect | enable`
- `difficulty`: `easy | moderate | hard`
- `skillId`: one skill of `careerId` in `data/catalog.json` when `SKILL_MODEL=taxonomy`

```json
{
  "schemaVersion": "0.1",
  "selectedMoveId": "3b9f2c1e-...",
  "userId": "7c1e0b9a-...",
  "wishId": "92903df3-...",
  "selectedAt": "2026-11-05T19:47:38Z",
  "status": "active",
  "profileVersion": 3,
  "wish": {
    "text": "Get a data analyst internship for next summer",
    "type": "fixed", "focus": ["goal"], "domains": ["career"],
    "why": "I want real production experience before I graduate",
    "priorAttempts": { "chips": ["youtube"], "text": "Watched tutorials, never built anything" },
    "followUps": [ { "question": "How many hours per week can you give this?", "answer": "Less than five hours" } ]
  },
  "move": {
    "id": "6a1d...", "key": "gen-f24bfd8ee9",
    "title": "Publish one SQL analysis of a public dataset",
    "detail": "Pick a city open-data table, answer one question with three SQL queries, and post the queries and a chart in a GitHub README.",
    "step": 1, "minutes": 45, "cost": "free", "format": "solo",
    "focus": ["goal"], "domains": ["technical"], "archetypeFit": { "builder": 0.8 },
    "activityType": "create", "difficulty": "moderate", "skillId": "sql", "careerId": "data_analyst"
  },
  "selection": { "step": 1, "position": 1, "rerollIndex": 0, "msSinceShown": 18400, "shownMoveIds": ["...", "...", "..."], "rejectedBefore": [] },
  "provenance": { "provider": "gemini", "model": "gemini-3.1-flash-lite", "promptVersion": "moves.v5", "latencyMs": 2140, "tried": [] }
}
```

## GrowthState v0.1 with Unlocks (Module 3, owner Christina Phan)

This is the `Growth-Validation` branch's `/integrations/growth-state` output, extended with:
- unlocks (the backbone diagram's "GrowthState + Unlocks");
- pending points;
- per-skill gates;
- recent outcomes, which the next move's prompt uses (D-07).

It is computed from the points ledger every time it is read. Reading it never writes (T-14).

| Field | Type | Notes |
|---|---|---|
| schemaVersion | `"0.1"` | |
| userId | uuid | |
| careerId | string | |
| rulesVersion, catalogVersion | string | which scoring rules and catalog produced it |
| totals | `{validated, pending, effortRaw, effortCounted, effortBanked, impact}` | impact = validated + effortCounted (D-20) |
| roleTier | `Not started \| Familiar \| Proficient \| Demonstrated \| Verified` | D-28 |
| skills | `[{skillId, name, core, points, pendingPoints, tier, nextTier, nextThreshold, progress 0..1, gates[{rule, met}]}]` | gates explain why a tier isn't reached yet, e.g. "needs a hard validated item" |
| unlocks | `[{opportunityId, title, tier, kind: real\|seeded\|flag\|display, unlockedAt}]` | D-25, D-26 |
| recentOutcomes | `[{evidenceId, selectedMoveId, skillId, status, aiScore, finalQuality, points, feedbackSummary, buddyComment?, peerConfirmed}]` ≤5 | |
| computedAt | timestamp | |

```json
{
  "schemaVersion": "0.1",
  "userId": "7c1e0b9a-...",
  "careerId": "data_analyst",
  "rulesVersion": "1.1", "catalogVersion": "c-5f2a91",
  "totals": { "validated": 41.6, "pending": 7.7, "effortRaw": 9, "effortCounted": 9, "effortBanked": 0, "impact": 50.6 },
  "roleTier": "Familiar",
  "skills": [
    { "skillId": "sql", "name": "SQL", "core": true, "points": 33.9, "pendingPoints": 0, "tier": "Familiar", "nextTier": "Proficient", "nextThreshold": 100, "progress": 0.339,
      "gates": [ { "rule": "100 points", "met": false }, { "rule": "2 validated items", "met": true } ] }
  ],
  "unlocks": [ { "opportunityId": "study-group", "title": "Study group", "tier": "Familiar", "kind": "real", "unlockedAt": "2026-11-05T21:10:00Z" } ],
  "recentOutcomes": [
    { "evidenceId": "e1...", "selectedMoveId": "3b9f...", "skillId": "sql", "status": "validated", "aiScore": 0.82, "finalQuality": 0.79, "points": 23.7,
      "feedbackSummary": "Clear queries; add one sentence on what the chart shows.", "buddyComment": "Ran it, works. Nice chart.", "peerConfirmed": true }
  ],
  "computedAt": "2026-11-05T21:12:03Z"
}
```

## SocialEvidence v0.1 (Module 4, owner Michael Hawes)

This is the record created when a buddy leaves feedback on a move's evidence. The backbone diagram calls it "social interaction becomes evidence". Growth receives it through `growth.api.apply_social_evidence()`. It is stored once and never edited.

| Field | Type | Notes |
|---|---|---|
| schemaVersion | `"0.1"` | |
| id | uuid | |
| invitationId, evidenceId, selectedMoveId | uuid | |
| ownerId, reviewerId | uuid | they are never the same person (D-34) |
| reviewerRole | `reviewer \| tester` | D-30 |
| reviewerTier | `Proficient \| Demonstrated \| Verified \| Mentor` | the reviewer's tier in the owner's career at review time, floored at Proficient (D-14) |
| rating | int 1–5, or null | required for reviewers |
| confirmed | bool, or null | required for reviewers; `false` means needs work (D-19) |
| comment | string ≤1000 | |
| countsTowardPoints | bool | false for testers unless `TESTER_COUNTS=true` |
| createdAt | timestamp | |

```json
{
  "schemaVersion": "0.1",
  "id": "5e0c...", "invitationId": "a71b...", "evidenceId": "e1...", "selectedMoveId": "3b9f...",
  "ownerId": "7c1e0b9a-...", "reviewerId": "c2d4...",
  "reviewerRole": "reviewer", "reviewerTier": "Proficient",
  "rating": 4, "confirmed": true, "comment": "Ran it, works. Nice chart.",
  "countsTowardPoints": true, "createdAt": "2026-11-06T02:14:00Z"
}
```

## FeedItem v0.1 (Module 5, owner JBarroqu)

This is Event_Ecosystem's `Notification` type with real timestamps and links. `time` used to be a pre-written string like "2 Day Ago"; the frontend now formats `createdAt`.

| Field | Type | Notes |
|---|---|---|
| schemaVersion | `"0.1"` | |
| id | uuid | |
| category | `Social \| Pro \| Enablement \| Impact \| Events \| Growth` | Event_Ecosystem's six categories (D-38) |
| kind | string | e.g. `move_locked`, `evidence_scored`, `buddy_invited`, `unlock_granted` |
| title, body | string | plain copy, no emoji |
| link | string | an app route, e.g. `/growth/evidence/e1...` |
| sourceModule | `profile \| wish \| growth \| social \| feed` | |
| sourceId | uuid | |
| createdAt | timestamp | |
| readAt | timestamp or null | |

## EventContext v0.1 (Module 5)

| Field | Type | Notes |
|---|---|---|
| schemaVersion | `"0.1"` | |
| userId | uuid | |
| lastSeenAt, previousSeenAt | timestamp | |
| whileYouWereAway | `{count, byCategory{Social: n, ...}, items: FeedItem[] ≤10}` | items since `previousSeenAt` (D-39) |
| external | `[]` | reserved for outside events (D-41) |

## BestNextMoveTrigger v0.1 (Module 5)

| Field | Type | Notes |
|---|---|---|
| schemaVersion | `"0.1"` | |
| kind | `review_requested \| revise_evidence \| submit_evidence \| invite_buddy \| await_buddy \| next_move_ready \| start_wish \| complete_profile \| none` | the first that applies, in D-40's order |
| reason | string | one plain sentence for the Home card |
| priority | int | position in the D-40 order |
| link | string | route to act on it |
| refs | `{wishId?, selectedMoveId?, evidenceId?, invitationId?}` | |

## Domain events v0.1

Modules publish domain events after a database commit (T-12). The feed turns each one into at most one notification. Each event has a `dedupe_key`, so a replay never creates a duplicate.

Common fields: `{eventId, schemaVersion, occurredAt, userId, refs}`.

| Event | Published by | refs |
|---|---|---|
| ProfileUpdated | profile | `{version}` |
| MoveSelected | wish | `{wishId, selectedMoveId}` |
| NextMoveReady | wish | `{wishId, step}` |
| EvidenceSubmitted | growth | `{evidenceId, selectedMoveId}` |
| EvidenceScored | growth | `{evidenceId, aiScore, provisionalPoints}` |
| EvidenceValidated | growth | `{evidenceId, points, peerConfirmed}` |
| EvidenceNeedsWork | growth | `{evidenceId}` |
| TierReached | growth | `{skillId, tier}` |
| UnlockGranted | growth | `{opportunityId}` |
| InvitationCreated / Accepted / Declined | social | `{invitationId, selectedMoveId, role}` (sent to the invitee or owner as relevant) |
| FeedbackSubmitted | social | `{invitationId, evidenceId, socialEvidenceId}` |
