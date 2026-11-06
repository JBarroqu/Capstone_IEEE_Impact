# API

These rules apply to every endpoint unless noted:

- **Base path:** `/api/v1`.
- **Auth:** the Supabase access token goes in `Authorization: Bearer <token>`.
- **Request bodies:** JSON, capped per route (1–64 KB). File uploads are multipart.
- **Errors:** `{"ok": false, "error": "..."}` with these statuses:
  - 400: invalid input. FastAPI's 422 is never used.
  - 401: missing or bad token.
  - 403: not allowed.
  - 404: not found.
  - 409: state conflict, e.g. the next move isn't open yet.
  - 429: rate limited, with `Retry-After`.
  - 503: the database or every model is down.
- **Field names:** camelCase in JSON. Analytics event payloads keep their snake_case keys.
- **OpenAPI:** the live spec is at `/docs` in development only. It is off in public mode.

The shape of each contract returned below is in `CONTRACTS.md`.

## Platform

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | `{ok:true}` |
| GET | `/config` | none | Public policy values (e.g. `VALIDATION_MODE`, used to word the UI), catalog version, wish starter chips |
| GET | `/me` | user | `{userId, email, onboarded, handle}` |
| POST | `/events` | user, or page-close ticket | Analytics batch `{events:[...]}`. Duplicates are ignored by event id. |
| POST | `/events/ticket` | user | `{ticket, expiresAt}` for page-close beacons (T-13) |

## Profile (M1)

| Method | Path | Purpose |
|---|---|---|
| GET | `/profile` | Your ProfessionalState |
| PUT | `/profile` | Save the full profile. `completeOnboarding: true` marks onboarding done. Returns ProfessionalState with `version` bumped. |
| GET | `/profile/handle-available?h=` | `{available}` |
| POST | `/profile/import` | Multipart resume (PDF/DOCX ≤5 MB). Returns 202 `{importId}`. |
| GET | `/profile/import/{id}` | `{status, draft?}`, where `draft` has ProfessionalState fields to review |
| POST | `/profile/import/{id}/discard` | Throw the draft away |
| GET | `/integrations/professional-state` | Contract mirror |

## Wish (M2)

| Method | Path | Purpose |
|---|---|---|
| GET | `/wishes` | Your wishes with status and current step |
| GET | `/chips` | Starter wishes for the intake chips (`data/wishes.json`) |
| GET | `/wishes/{id}` | One wish with its selected moves, `nextStep` and `nextOpen` |
| POST | `/wishes` | Create or update a wish: `{id, text?, fromChip?, type?, focus?, domains?, guessed*?, why?, priorAttempts?, followUps?, archetype?}`. The client sends its own uuid; partial updates are upserts. 409 past `MAX_ACTIVE_WISHES`. |
| POST | `/wishes/{id}/status` | `{status: active\|completed\|abandoned}` |
| POST | `/classify` | `{wishText}`. Classify a wish: model, with the keyword classifier as fallback |
| POST | `/questions` | `{wishText, type, focus, domains, why?, prior}`. Three follow-up questions: model, with the fixed set as fallback |
| POST | `/wishes/{id}/options` | `{step, rerollIndex?, rejectedMoveIds?, rejectReason?}`. The server builds the prompt from the stored wish, the profile (D-06), earlier outcomes (D-07) and everything already shown for this step. Returns `{moves[], meta, skills}`. 409 if this step isn't open (D-03), 503 if every model failed. |
| POST | `/wishes/{id}/select` | `{moveId, msSinceShown?, shownMoveIds?, rejectedBefore?}`. Returns SelectedMove. |
| GET | `/selected-moves?status=` | Your selected moves |
| GET | `/selected-moves/{id}` | One SelectedMove |
| POST | `/selected-moves/{id}/abandon` | Give up on a move. The step reopens. |
| GET | `/integrations/selected-move/{id}` | Contract mirror |

## Growth (M3)

| Method | Path | Purpose |
|---|---|---|
| GET | `/catalog` | Careers, skills, opportunities from `data/catalog.json` |
| GET | `/growth` | Your GrowthState |
| POST | `/evidence` | Multipart: `selectedMoveId`, `artifactType` (link/file/text), `url` or `file` or text, `summary`. Returns 202 with the evidence, status `scoring`. Skill, type and difficulty come from the selected move. |
| GET | `/evidence?selectedMoveId=` | Your evidence |
| GET | `/evidence/{id}` | One evidence item: rubric criteria, feedback, status, points |
| POST | `/evidence/{id}/revise` | Submit a revision, which creates a new row with `revision_of` |
| POST | `/evidence/{id}/retry-scoring` | Only when the status is `ai_error` |
| GET | `/evidence/{id}/file-url` | 60 s signed link. Allowed for the owner, or the accepted buddy on that move. |
| GET | `/score-events` | Your points ledger, newest first |
| GET | `/integrations/growth-state` | Contract mirror |

## Social (M4)

| Method | Path | Purpose |
|---|---|---|
| GET | `/users/lookup?handle=` or `?email=` | Exact match only (D-35). Returns `{handle, displayName}`. |
| POST | `/invitations` | `{selectedMoveId, buddy: handle or email, role: reviewer\|tester, message?}` |
| GET | `/invitations?box=received\|sent` | Invitations with move title and status |
| POST | `/invitations/{id}/accept` · `/decline` · `/revoke` | State changes. Accept and decline are the invitee's; revoke is the owner's. |
| GET | `/reviews/queue` | Evidence waiting for your review as an accepted buddy |
| POST | `/invitations/{id}/feedback` | `{evidenceId?, rating?, confirms?, body}`. Reviewers must send `rating` and `confirms`; testers must send `body`. Returns SocialEvidence. |
| GET | `/selected-moves/{id}/feedback` | Feedback on one of your moves |
| GET | `/integrations/social-evidence/{id}` | Contract mirror |

## Feed (M5)

| Method | Path | Purpose |
|---|---|---|
| GET | `/feed?category=&unread=&cursor=` | FeedItems, newest first, paginated |
| POST | `/feed/{id}/read` | Mark read. Send `{read:false}` to mark unread (Event_Ecosystem's read toggle). |
| POST | `/feed/read-all` | Mark everything read |
| GET | `/home` | `{eventContext, bestNextMove, activeMoves[], growthSummary, profileCard}` in one call. Opening Home counts as a visit (moves `last_seen_at` into `previous_seen_at`, D-39). |

## Admin (`/api/admin`, signed `wish_admin` cookie from `ADMIN_PASSWORD`, D-47)

| Method | Path | Purpose |
|---|---|---|
| POST | `/login` · `/logout` | Admin session (12 h, SameSite=Strict) |
| GET | `/dashboard?from=&to=&user=` | Analytics: funnel, pick rate by position, reject reasons, model usage and latency, journeys |
| GET | `/export/{events\|choices\|feedback\|moves}` | CSV |
| POST | `/models` | `{action: prefer\|test\|refresh}`: model chain controls |
| GET / PUT | `/policies` | List every policy with its value, its source (default, env or admin) and its decision text; set or clear an admin override (D-52) |
| POST | `/endorsements` | `{userId, skillId, note}`: Verified endorsement (D-24) |
| GET | `/users/{handle}/growth` | Any user's GrowthState |
| GET | `/session` · POST `/logout` | Whether the admin cookie is valid · sign out |
| POST | `/evidence/{id}/rescore` | Re-run the rubric |
| GET | `/client-ip` | Debug: the client IP the rate limits see |
