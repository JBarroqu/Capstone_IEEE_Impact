# Module 1: Professional State

**Owner:** Cfoley5.
**Source:** branch `Professional-State` @ `8e3fbfe` (`backend/main.py`).
**Code:** `backend/app/modules/profile/`, `frontend/src/modules/profile/`.

## What the branch had
- A FastAPI app with one SQLite table, `profiles(user_id, data)`, storing the whole profile as a JSON blob.
- A pydantic `ProfessionalState` with these fields: `name`, `headline`, `bio`, `education{institution, major}`, `position`, `skills`, `interests`, `featuredContributions[{title, type, description, verificationStatus}]`, `growthAreas`.
- `GET`/`PUT /api/v1/profiles/demo-user` for one hardcoded user.
- No auth and no frontend. CORS was set for a Vite app on :5173 that wasn't committed.

## What we kept
- Every field and its meaning, and the contribution types (`project`, `coursework`, `professional`, `other`).
- The `self_reported`/`verified` status on contributions.
- The output as the ProfessionalState contract, now versioned `0.1` (`CONTRACTS.md`).

## What we changed, and why

| Change | Why | Decision |
|---|---|---|
| Real users (Supabase id) instead of `demo-user` | One auth for the whole app | T-08 |
| Proper columns + a `contributions` table instead of a JSON blob | Queryable, validated, and other modules can rely on it | DATA_MODEL |
| Added `strengths` | It's in the backbone diagram and was missing | D-44 |
| Added `targetCareerId` | Growth tracks skills against a career (Module 3) | D-08, D-10 |
| Added a unique `handle` | Buddies invite each other by handle (Module 4) | D-51 |
| Removed the "Alex Morgan" defaults | A missing field silently became fake data, and GET returned a fake profile when none existed | D-44 |
| Only the server can set `verified` | Users could mark their own contributions verified | D-44, D-45 |
| Length limits on every field | None existed; the profile goes into model prompts | SECURITY |
| A guided onboarding form + optional resume import | No frontend existed; the team chose this flow | D-01, D-42, D-43 |

## What we dropped
- The SQLite file. The committed `professional_state.db` contains a real name; see `PROVENANCE.md`.
- The `/state` alias route.

## How other modules use it (`profile/api.py`)
- `get_professional_state(user_id) -> ProfessionalState`
- `to_prompt_profile(state, mode) -> dict`: the reduced view the Wish Engine puts in its prompt (D-06)
- `get_handle_card(user_id) -> {handle, displayName}`: used by buddies and the feed
- `is_onboarded(user_id) -> bool`

It publishes `ProfileUpdated` on every save.

## Policies that affect this module
- `ONBOARDING_REQUIRED` (D-01)
- `PROFILE_IN_MOVES` (D-06)
- `PROFILE_IMPORT`, `RESUME_MAX_MB`, `RESUME_RETENTION` (D-42)
- `CONTRIBUTION_FROM_EVIDENCE` (D-45)
- `HANDLE_REQUIRED` (D-51)

## Resume import, in detail (D-42, D-43)
1. The browser uploads the file to `POST /profile/import`. The API checks the size (≤5 MB), the MIME type and the file's magic bytes (PDF/DOCX only).
2. The file is stored in the private `resumes` bucket.
3. The text is extracted with `pypdf` or `python-docx`, up to 12,000 characters. This is the same extraction Growth-Validation used for evidence.
4. One model call (`resume.v1`) returns JSON that matches the ProfessionalState fields. The prompt says the text is untrusted data, and the output is schema-validated.
5. The file is deleted. The draft is stored on the `resume_imports` row.
6. The onboarding form loads the draft. Nothing reaches `profiles` until the user saves.

## Swapping the internals
- Keep `api.py`'s functions and the contract, and everything else in `modules/profile/` can change freely.
- Example: replacing resume import with a LinkedIn import only touches `profile/resume/` and the onboarding page.

## Tests
- Contract round-trip.
- Validation limits.
- `verified` can't be set by the client.
- Import with the fake model; the file is deleted after import.
- Onboarding redirect (frontend).
- End-to-end: sign up, then onboard, then Home.
