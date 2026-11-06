# Module 2: Wish & Next Move (Wish Engine)

**Owner:** Waleed.
**Source:** branch `wish-engine` @ `86aa71f`. The `integration` branch was created from it, so its history continues here. The old docs are in `docs/wish-engine/`.
**Code:** `backend/app/modules/wish/`, `backend/app/llm/`, `frontend/src/modules/wish/`.

## What the branch had
- A Next.js frontend and a FastAPI backend.
- The flow: welcome (name + consent), wish, why / prior attempts, three generated follow-up questions, then three generated move options per step. You could reject with a reason and reroll, or lock in a move. A rating survey followed.
- A model chain: Gemini models discovered and ranked, with failover to Groq, OpenRouter and Ollama, cooldowns and a request queue.
- An event log of every pick, skip and reject, plus an admin dashboard with CSV exports.
- Security: a signed session cookie, rate limits, body caps and an admin password.

## What we kept
- The flow logic: the `Flow.tsx` state machine, Pick, reject reasons and reroll, follow-up questions, and the fallbacks (keyword classifier, fixed question set).
- **The rule that every move is model-generated**: no catalog, no cache, no fallback moves (D-29).
- The model chain, moved to `backend/app/llm/` and shared by every module (T-10).
- The event log and admin analytics, now keyed by user id (D-46).
- The admin password login (D-47).
- Rate limits, body caps and security headers, moved to `backend/app/platform/`.

## What we changed, and why

| Change | Why | Decision |
|---|---|---|
| Moves prompt `moves.v5` adds a profile summary after the follow-up answers | The professional state should shape the moves | D-06 |
| Each move is tagged with `activityType`, `difficulty`, `skillId`, `careerId` | Growth scores these; the model sets them, the user can't | D-11 |
| The skill list in the prompt comes from the user's target career | Skills must match the taxonomy | D-08 |
| From step 2, the prompt includes the previous move's outcome | The next move builds on real results | D-07 |
| One move at a time, gated on validation | The integrated loop is do → evidence → review → next | D-02, D-03 |
| `participantCode`, `sessions`, the consent screen and the signed session cookie are gone | Real accounts via Supabase | T-04, D-46 |
| The survey screens (rating, would-do-this-week, open feedback) are off by default | Study mechanics, not product | D-46 |
| Next.js replaced by React + Vite | One frontend for the whole product | ARCHITECTURE |
| The Figtree / ink design replaced by the Event_Ecosystem design | One design | DESIGN |
| `generated_moves` becomes `wish.moves` (every option shown) and `wish.selected_moves` (the picks) | SelectedMove is a stored contract now | DATA_MODEL |

## How other modules use it (`wish/api.py`)
- `get_selected_move(id) -> SelectedMove`
- `list_open_moves(user_id) -> list[SelectedMove]`
- `set_selected_move_status(id, status)`, called by growth and social as evidence moves along
- `is_next_move_open(wish_id) -> bool`, which applies `NEXT_MOVE_GATE`

It publishes `MoveSelected` and `NextMoveReady`.

## Prompt changes (`moves.v5`)
- The profile block goes right after the follow-up answers.
- The skill list is a JSON-schema `enum`.
- The "previous outcome" block is added from step 2.
- The `MOVES_SYSTEM` line that assumed "senior CS majors" is kept, but it now says to prefer the profile when one is present.
- Still exactly one off-topic style example and no worked paths.
- `PROMPT_VERSION` is bumped. Analytics groups results by prompt version.

## Policies that affect this module
- `MOVES_PER_WISH` (D-02)
- `NEXT_MOVE_GATE` (D-03)
- `OPTIONS_PER_STEP` (D-04)
- `MAX_STEPS_PER_WISH` (D-05)
- `MAX_ACTIVE_WISHES` (D-53)
- `PROFILE_IN_MOVES` (D-06)
- `NEXT_MOVE_CONTEXT` (D-07)
- `MOVE_TAGS_SOURCE` (D-11)
- `SKILL_MODEL` (D-08)
- `SURVEY_SCREENS` (D-46)
- `LLM_PROVIDER` (T-10)

## Tests
- The Wish Engine's model chain, prompt, analytics and reliability tests are ported.
- Prompt snapshots for each `PROFILE_IN_MOVES` value.
- The schema rejects a move without tags.
- The gate returns 409.
- End-to-end: wish to locked move.
