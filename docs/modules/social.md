# Module 4: Human Roles & Social Support (Buddies)

**Owner:** Michael Hawes.
**Source:** branch `mike-branch` @ `402939b` (`server.py`, `tests/test_api.py`).
**Code:** `backend/app/modules/social/`, `frontend/src/modules/social/`.

## What the branch had
- A Python standard-library HTTP server with SQLite and its own username/password auth (PBKDF2, 7-day session cookie).
- Projects with milestones.
- Invite a buddy by username search; the buddy accepts or declines.
- Only the accepted buddy may post free-text feedback.
- Rules:
  - one accepted buddy per project;
  - any existing invite blocks a re-invite;
  - the owner can't be their own buddy;
  - pending or declined invites give no access.
- 14 well-written API tests.

## What we kept
- **The invite state machine and its access rules**: invite → accept / decline, only the accepted buddy can see the work and leave feedback, one accepted buddy (now per role, per move), no re-invite (D-31, D-33, D-34).
- Every one of the 14 test cases, rewritten as pytest against Postgres.

## What we changed, and why

| Change | Why | Decision |
|---|---|---|
| A buddy joins a **selected move** instead of a hand-made project; evidence replaces milestones | Module 2's selected move is what Module 4 supports | D-32 |
| Two roles, **reviewer** and **tester** | The backbone diagram names both; the branch had one generic buddy | D-30 |
| A reviewer's feedback has a 1–5 rating and a confirm / not-confirm | The diagram's "confirm" step was missing | D-13, D-19 |
| Feedback becomes **SocialEvidence v0.1** and is sent to growth | "Turn social interaction into evidence" was missing | CONTRACTS |
| Find buddies by exact handle or email; your search-as-you-type is the `search` choice | The search let anyone list every username | D-35 |
| Invitation, accept and feedback notifications go to the feed | Module 5 | D-38 |
| Own auth, `users`, `sessions` removed | One auth | T-04 |

## What we dropped
- Projects, milestones and their edit/delete routes: replaced by moves and evidence.
- The committed `buddy.sqlite3`, which holds password hashes and a live session; see `PROVENANCE.md`.
- The `__pycache__` files.

Fixed in passing: the connection leak, logout returning 401 for expired sessions, and HTML error pages breaking `r.json()`.

## How other modules use it (`social/api.py`)
- `accepted_buddy(selected_move_id, role) -> user_id | None`
- `pending_reviews(user_id) -> list`: for Home's best next move
- `can_view_evidence(user_id, evidence_id) -> bool`: used by growth's signed file links (D-36)

It publishes `InvitationCreated`, `InvitationAccepted`, `InvitationDeclined` and `FeedbackSubmitted`. It calls `growth.api.apply_social_evidence()`.

## Policies that affect this module
- `BUDDY_ROLES`, `TESTER_COUNTS` (D-30)
- `BUDDIES_PER_MOVE` (D-31)
- `REINVITE_AFTER_DECLINE` (D-33)
- `BUDDY_DISCOVERY` (D-35)
- `REVIEWER_EARNS` (D-37)
- `VALIDATION_MODE`, `BUDDY_TIMEOUT_DAYS` (D-13, D-18, shared with growth)

## Tests
- The 14 original cases: auth required, privacy of pending invites, owner-only actions, one accepted buddy, no self-invite, feedback only from the accepted buddy, cascade on delete.
- Role rules.
- SocialEvidence creation.
- End-to-end with two users: invite, accept, review, then points finalised.
