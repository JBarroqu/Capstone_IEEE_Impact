# Handoff: the selected move

For whoever builds the module that consumes the Wish Engine's output. The engine's internals are covered in `docs/ARCHITECTURE.md`; this page is only about what you receive.

## What you get

A student names a wish. The engine asks three generated follow-up questions, then shows three generated moves. The student either locks one in, or rejects the set with a reason and gets a new one. **The locked move, with the context that produced it, is the handoff.** There is one record per locked move. In the study build (`FLOW_MOVES=1`), that means one record per wish.

## Status

| | |
|---|---|
| Built | Full student flow. Every locked move is stored in Postgres with its context, the model that wrote it, and the later rating. |
| Not built | Any API or push for your module. The `SelectedMove` shape below is a **proposal**: every field exists in the database today, so producing it is a join, not new data collection. |
| Not built | Public hardening. The engine runs on a laptop or LAN only; see `docs/GOING-PUBLIC.md`. |

**Recommendation:** a pull endpoint on the FastAPI backend, `GET /api/handoff/{wishId}`, that returns `SelectedMove`. A push to your module when the move is locked would need a retry queue, and it would fire before the rating exists.

## SelectedMove (proposed `selected-move.v1`)

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | `"selected-move.v1"` | |
| `sessionId`, `wishId` | uuid | Link back to the stored rows |
| `participantCode` | string | Study label. It is the student's first name, so treat it as personal data. |
| `selectedAt` | ISO 8601 | Browser clock when the move was locked |
| `wish.text` | string, ≤ 500 | |
| `wish.type` | `fixed` \| `open_ended` | `fixed` = a clear finish line |
| `wish.focus` | 1–2 of `learn` `goal` `system` `advance` `lead` `connect` | From model classification |
| `wish.domains` | 1–2 of `career` `academic` `technical` `venture` `leadership` | From model classification |
| `wish.why` | string or null | |
| `wish.priorAttempts` | `{ chips: string[], text?: string }` | What they already tried and didn't like |
| `wish.followUps` | `{ question, answer, note }[]` | `note` = what the question was meant to find out (never shown to the student) |
| `move.id` | `"gen-"` + 10 hex | The same title and step always give the same id, across students |
| `move.title` | string, ≤ 60 | Imperative |
| `move.detail` | string | Exactly one sentence. A cost shows as `[PRICE]`; no real prices. |
| `move.step` | 1–5 | 1 = quick first win (under about 60 min), 2 = builds on 1, 3 = the shipped version, 4 and 5 extend the path |
| `move.minutes` | integer | Estimate |
| `move.cost` | `free` \| `paid` | The model's judgement; treat it as a hint |
| `move.format` | `solo` `peer` `group` `mentor` `course` `project` `event` | |
| `move.focus`, `move.domains` | same vocabularies as the wish | |
| `move.archetypeFit` | `{ builder?, connector?, planner?, explorer?: 0..1 }` | Ranking hint |
| `selection.step` | 1–5 | |
| `selection.position` | 0–2 | **0-based** card position; 1 = the middle card |
| `selection.rerollIndex` | integer | 0 = first set shown; 1 = after one reject |
| `selection.msSinceShown` | integer | Decision time |
| `selection.shownMoveIds` | string[3] | The set the pick came from |
| `selection.rejectedBefore` | `{ reason, text, moveIds }[]` | Earlier sets for this step and why they were rejected. `reason` is the chip label: `Too big`, `Too small`, `Not my style`, `Already done this`, `Don't want to pay`, `Other`. |
| `provenance` | `{ provider, model, promptVersion, latencyMs, tried }` | `tried` lists models that failed before this one answered |
| `rating` | 1–5 or null | Arrives later as a separate event; may never come |

## Sample (real session, 2026-11-03)

```json
{
  "schemaVersion": "selected-move.v1",
  "sessionId": "fa5acbc5-eac1-413b-8988-c24a95a3eb96",
  "wishId": "92903df3-7aca-4166-ac1d-e5cfcca62dfe",
  "participantCode": "TEST Demo",
  "selectedAt": "2026-11-03T19:47:38.147Z",
  "wish": {
    "text": "Get a backend engineering internship for next summer",
    "type": "fixed",
    "focus": ["goal"],
    "domains": ["career"],
    "why": "I want real production experience before I graduate, not just class projects.",
    "priorAttempts": { "chips": ["youtube"], "text": "Watched system design videos but never built anything with them." },
    "followUps": [
      { "question": "How many hours per week can you dedicate to this?", "answer": "Less than five hours", "note": "determines the pacing and complexity of the initial moves" },
      { "question": "What is your main timeline constraint right now?", "answer": "Applying immediately", "note": "reveals immediate readiness versus preparation focus" },
      { "question": "How do you prefer to prepare for technical interviews?", "answer": "Practicing coding problems alone", "note": "helps tailor the interview prep strategy to personal learning style" }
    ]
  },
  "move": {
    "id": "gen-f24bfd8ee9",
    "title": "Annotate one project for production readiness",
    "detail": "Open your best existing class project and add a README section detailing specifically how you would implement rate limiting, logging, or database indexing to make it production-ready.",
    "step": 1,
    "focus": ["goal"],
    "domains": ["technical"],
    "minutes": 30,
    "cost": "free",
    "format": "solo",
    "archetypeFit": { "builder": 0.8, "connector": 0.1, "explorer": 0.2, "planner": 0.6 }
  },
  "selection": {
    "step": 1,
    "position": 1,
    "rerollIndex": 1,
    "msSinceShown": 1044,
    "shownMoveIds": ["gen-fe1f4043a9", "gen-f24bfd8ee9", "gen-ea767e21ed"],
    "rejectedBefore": [
      { "reason": "Too big", "text": null, "moveIds": ["gen-713dad4358", "gen-77dfd17775", "gen-a268885ae8"] }
    ]
  },
  "provenance": {
    "provider": "gemini",
    "model": "gemini-3.1-flash-lite",
    "promptVersion": "moves.v4",
    "latencyMs": 14885,
    "tried": ["gemini:gemini-3.5-flash-lite:timeout"]
  },
  "rating": 4
}
```

## Getting it today

Every field comes from one query (tested against the session above):

```sql
select e.client_ts, e.session_id, e.wish_id, e.participant_code,
       e.payload as selection,                -- move_id, position, ms_since_shown, reroll_index
       g.move, g.provider, g.model, g.prompt_version,
       w.text, w.type, w.focus, w.domains, w.why, w.prior_attempts, w.follow_ups,
       r.payload->>'rating' as rating
from events e
join generated_moves g on g.id = e.payload->>'move_id' and g.session_id = e.session_id
join wishes w on w.id = e.wish_id
left join events r on r.wish_id = e.wish_id and r.name = 'path_rated'
where e.name = 'move_locked';
```

`rejectedBefore` and `shownMoveIds` come from the `options_rejected` and `options_shown` events with the same `wish_id` and `step`.

Without database access, the admin page's `choices.csv` export has one row per option set, with the pick or the reject reason.

## What you can rely on

- Every move is generated for this student. There are no catalog moves. If the models fail, the student retries, so a stored move always came from a model.
- Ids are stable: the same title and step always give the same id.
- Shape: the title is ≤ 60 characters, the detail is one sentence, minutes is an integer, and the enums take only the values listed.
- Each set has at least 2 free moves and at most 1 paid. No prices are stated.
- Products, tools and companies are named when they help. The model is told to name only real ones, but nobody checks them, and no links are generated.
- `promptVersion` is on every record. A new version can change the style of moves, not the shape.

## Open questions for your module

1. Pull from the engine, or have it push to you?
2. Do you need the rating, which arrives later or never?
3. Only move 1, or the full path (`FLOW_MOVES=3`, moves 1–3 in step order)?
4. Do you want the rejected options too, as a signal?
5. Keep `participantCode` (a first name) or drop it?
6. Who approves a new `schemaVersion`?
