# Impact++

Five capstone modules joined into one product:
- **Frontend:** React 19 + Vite + Tailwind 4 in `frontend/`.
- **Backend:** one FastAPI service in `backend/app/`.
- **Data and auth:** one Supabase project (Postgres, Auth, Storage), deployed as one Render web service.

This codebase was started from the `wish-engine` branch. The other modules were ported by hand (`docs/PROVENANCE.md`). The old Wish Engine notes are in `docs/wish-engine/CLAUDE.md`.

## Read first
- `docs/README.md`: index and module owners.
- `docs/MODULE_OWNER_DECISIONS.md`: only the places where the integrated app differs from what a module owner built, or adds new logic, each with its policy setting. Owners review it. **A new behaviour change that touches another module's work gets an entry here.**
- `docs/ARCHITECTURE.md`, `CONTRACTS.md`, `DATA_MODEL.md`, `API.md`, `SCORING.md`, `DESIGN.md`, `SECURITY.md`, `TESTING.md`, `DEPLOY.md`, `CI_CD.md`.
- `docs/modules/*.md`: what was kept, changed and dropped from each branch.

## Rules
- **Commits and pushes**
  - No `Co-Authored-By` or "Generated with Claude Code" lines in commits or PRs; plain messages.
  - Commit after each stage. Never push without being asked.
  - Remote `origin` = `waleedalfar/Capstone_IEEE_Impact` (moved from JBarroqu; the old URL redirects); it is the only remote. `main` is the default and only long-lived branch: branch from it and open a PR into it. (`integration` is retired.)
- **CI must pass** (`docs/CI_CD.md`)
  - Checks: "CI passed" and "Security passed". A merge to `main` deploys production after an approval (no staging yet; `STAGING_ENABLED` turns it on); only commits that pass deploy.
  - Before pushing: `npm run lint && npm test`. Pin new Actions to a full commit SHA with the version in a comment.
  - Runtime Python packages go in `backend/requirements.txt`; test and CI tools in `requirements-dev.txt`.
- **Every switchable decision is a policy**
  - Defaults live in `backend/app/policies/defaults.py`. Behaviour lives in the strategy classes in `policies/strategies.py`, whose docstrings start with the decision ID. Read values with `policies.get("KEY")` or a getter.
  - Never compare policy strings in business code; call the getter.
  - Overrides: an env var with the same name, or the admin Policies page (`core.settings`).
  - `tests/policies` checks that every key named in `MODULE_OWNER_DECISIONS.md` exists, and runs every choice.
- **Module boundaries** (`backend/.importlinter`, checked by `npm test`)
  - `app/modules/<m>` imports another module only through its `api.py`.
  - Cross-module data uses the contracts in `app/contracts`. After changing one, run `npm run schemas` and bump `schemaVersion`.
  - To avoid import cycles, cross-module imports are done inside functions (`_wish()`, `_growth()`, ...).
  - Admin reporting (`platform/admin`) is the only code outside a module allowed to read module tables.
- **Every move is model-generated** (D-29)
  - No catalogue, static moves, cache or fallback moves.
  - `prompts/moves_v5.py` keeps exactly one off-topic style example and no worked paths. Bump `PROMPT_VERSION` on any edit.
  - The fake model (`app/llm/fake.py`) loads only with `ENV=test LLM_FAKE=1`.
- **Design**
  - Only the Event_Ecosystem design. Tokens are in `frontend/src/design/tokens.css`; never use raw hex in components.
  - Never nest a `<button>` in a link; use `ButtonLink`.
- **Copy**
  - Written for senior ASU CS students. No emoji.
  - Never "AI" or "smart" in the UI (`frontend/src/test/copy.test.ts` checks this).
- **Data**
  - Reads never write. GrowthState is computed from the ledger. Points are append-only, with `rules_version` and `policy_snapshot`.
  - Publish domain events inside `db.tx()`; subscribers run after commit.
  - Update a selected move's status *before* publishing the growth event that depends on it.
- **One API worker** (T-11): model health, rate limits and background jobs are in memory.
- **Never read `.env` contents.** Local Supabase values go in the git-ignored `.env.local`, which loads first; `npm run db:start` (or `npm run env:local`) generates it from `supabase status`.

## Layout
**`backend/app/`**
- `main.py`: routers and the same-origin React build (SPA fallback).
- `config.py`, `db.py`: async SQLAlchemy Core with asyncpg; `tx()` and `read()`.
- `platform/`:
  - `auth`: Supabase JWT via JWKS, with an HS256 fallback.
  - `security`, `rate_limit`, `admin_auth`, `http`, `storage`, `textextract`.
  - `bus`, `jobs`.
  - `events_log/`: page-close tickets.
  - `admin/`: policies editor, analytics, exports, endorsements.
- `llm/`: the shared model chain.
- `contracts/`, `policies/` (`scoring/rules.py` holds Growth-Validation's constants as v1.0 and v1.1).
- `modules/{profile,wish,growth,social,feed}/`: `router.py`, `api.py`, `service.py`, `tables.py`, plus:
  - `wish/movegen.py`, `wish/prompts/`
  - `growth/scoring.py` (pure), `growth/rubric.py`, `growth/catalog.py`
  - `profile/resume.py`
  - `feed/next_move.py`

**Other folders**
- `supabase/migrations`: one schema per module, RLS deny-all, the new-user trigger, buckets. `supabase/config.toml` holds auth redirects and Google (off).
- `data/catalog.json`: careers, skills and opportunities. `data/wishes.json`: starter chips. `data/keywords.json`: the classifier fallback.
- `frontend/src/`:
  - `app/`: `App` router and guards, `AppShell`.
  - `lib/`: `api` (token, refresh, retries), `auth`, `config` (public policies), `track`, `types`.
  - `components/ui.tsx`.
  - `modules/*`, `admin/`.
- `contracts/schemas/*.json`: generated by `npm run schemas`.
- `e2e/full-loop.ts`: the two-user browser test.

## Commands
- **Set up and run:**
  - `npm run setup`
  - `npm run db:start` / `db:reset`
  - `npm run api` with `npm run dev` (:5173), or `npm run build && npm start` (:8000)
- **Test:**
  - `npm test`: vitest, tsc, pytest, import-linter. The integration tests need local Supabase.
  - `npm run lint`: ESLint and ruff (correctness rules only).
  - As CI does the browser test: `npm run build && scripts/ci/run-e2e.sh default` (refuses a busy port; `E2E_PORT`).
  - `npm run e2e:serve` then `npm run e2e`
- **Other:** `npm run llm:check`, `npm run schemas`.
- **Docker:** `docker build -t impact-app --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=... .`

## Gotchas
- **Tests**
  - pytest integration tests run the app in-process (`httpx.ASGITransport` + `lifespan_context`) against local Supabase.
  - They create users through the Supabase Auth API, and delete them afterwards (cascade).
  - Without Supabase they skip; CI sets `REQUIRE_SUPABASE=1` so that fails instead.
  - Frontend unit tests get placeholder Supabase values from `vite.config.ts` (`test.env`), never from `.env.local`.
  - Wait for background jobs with `jobs.drain()`.
- **Sign-in**
  - `supabase-js` exchanges the PKCE code itself (`detectSessionInUrl`). `/auth/callback` must not call `exchangeCodeForSession` again.
  - The local auth redirect allow-list is in `supabase/config.toml`; restart Supabase after editing it.
  - Local Supabase signs tokens with ES256 and serves JWKS, the same as cloud projects.
- **Playwright** role names match substrings. Use `exact: true`, and wait for a page's heading before filling fields (lazy routes).
- **Gemini** models get retired or overloaded often; the chain fails over. Use `npm run llm:check` to see which models answer.
