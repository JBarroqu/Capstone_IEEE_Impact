# Testing

`npm test` runs everything that doesn't need a live model or a browser. CI runs it on every push to `integration`.

## Layers

| Layer | Tool | Where | Needs |
|---|---|---|---|
| Unit | pytest | `backend/tests/unit` | nothing (the fake model, pure functions) |
| Integration | pytest, marker `db` | `backend/tests/integration` | local Supabase (`supabase start`). Each test runs in a transaction that is rolled back. |
| Contracts | pytest | `backend/tests/contracts` | nothing. Exported JSON Schemas match the committed ones; Python and TypeScript enums match. |
| Policies | pytest | `backend/tests/policies` | nothing. `DECISIONS.md` ↔ `defaults.py` key sync; **every choice of every strategy** runs. |
| Ported | pytest | `backend/tests/ported` | Growth-Validation's scoring tests (v1.0) and mike-branch's 14 buddy cases, as originally written in intent |
| Module boundaries | import-linter | `backend/pyproject.toml` | nothing. Modules import only each other's `api.py`. |
| Frontend | vitest + Testing Library + MSW | `frontend/src/**/*.test.tsx` | nothing. Components, `track.ts`, guards, copy check (no emoji, no "AI"/"smart"). |
| Types | `tsc --noEmit` | frontend | nothing |
| End-to-end | Playwright | `e2e/` | local Supabase + API + `vite preview`, `ENV=test LLM_FAKE=1` |
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
npm test                 # unit + contracts + policies + ported + frontend + typecheck + import-linter
npm run test:db          # integration tests (needs supabase start)
npm run e2e              # Playwright (needs supabase start)
npm run llm:check        # live models
```
