# Testing

`npm test` runs everything that doesn't need a live model or a browser. CI runs it on every push to `integration`.

## Layers

| Layer | Tool | Where | Needs |
|---|---|---|---|
| Unit | pytest | `backend/tests/unit` | nothing (the fake model, pure functions) |
| Integration | pytest | `backend/tests/integration` | local Supabase (`npm run db:start`); skipped when it isn't running. The app runs in-process; users are created through Supabase Auth and deleted afterwards. Includes mike-branch's buddy cases (`test_mike_buddy.py`). |
| Contracts | pytest | `backend/tests/contracts` | nothing. Exported JSON Schemas match the committed ones; Python and TypeScript enums match. |
| Policies | pytest | `backend/tests/policies` | nothing. every key named in `MODULE_OWNER_DECISIONS.md` exists in `defaults.py`; **every choice of every strategy** runs. |
| Ported | pytest | `backend/tests/ported` | Growth-Validation's scoring tests (v1.0), the SCORING.md worked examples, v1.0 vs v1.1 |
| Module boundaries | import-linter | `backend/.importlinter` | nothing. Modules import only each other's `api.py`. |
| Frontend | vitest | `frontend/src/test/*.test.ts` | nothing. Formatting, `track.ts` batching, copy check (no emoji, no "AI"/"smart"). |
| Types | `tsc --noEmit` | frontend | nothing |
| End-to-end | playwright-core + Chrome | `e2e/full-loop.ts` | local Supabase + `npm run e2e:serve` (API serving the build with `ENV=test LLM_FAKE=1`) |
| Live models | `npm run llm:check` | | real API keys; not in CI |

## The fake model
- `backend/app/llm/fake.py` returns schema-valid moves, questions, classifications, resume drafts and rubric scores.
- It **refuses to load unless `ENV=test`**, so the rule that every move is model-generated (D-29) holds in every real environment.

## End-to-end flows
1. Sign up with email and password, finish onboarding (resume import with the fake model), land on Home.
2. Sign in with a magic link. The link is read from Mailpit's API.
3. Wish, then questions, then options. Reject as "Too big", reroll, and lock move 1. The feed shows "Move locked".
4. Submit evidence. Pending points appear.
5. **Two users:**
   - A invites B as a reviewer;
   - B accepts, then rates and confirms;
   - A's points finalise, the tier and unlock appear in the feed, and "Next move ready" opens move 2.
6. Admin: log in, flip `VALIDATION_MODE` to `ai_only`, and submit evidence. It finalises without a buddy.

## Commands
```
npm test               # vitest + tsc + pytest (integration tests need npm run db:start) + import-linter
npm run e2e:serve      # separate terminal: build, then the API with the fake model on :8000
npm run e2e            # two users through the whole product; add -- --shots=DIR for screenshots
npm run llm:check      # live models
```
The browser test reads the live policies and follows whichever behaviour is on. Run it a second time with the owners'
original choices, so each alternative in `MODULE_OWNER_DECISIONS.md` is checked in the browser, not only in pytest:
```
BUDDY_DISCOVERY=search SURVEY_SCREENS=on MOVE_TAGS_SOURCE=user ONBOARDING_REQUIRED=false OPPORTUNITY_CHIP=events_pro npm run e2e:serve
npm run e2e
```
