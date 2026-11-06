# Impact++ (integration branch)

This branch joins the five Impact++ capstone modules into one product:
- **Frontend:** one React 19 + Vite + Tailwind 4 app.
- **Backend:** one FastAPI service.
- **Data and auth:** one Supabase project (Postgres, Auth, Storage), deployed on Render.

It was branched from `wish-engine`. The other modules are ported by hand from their branches (`docs/PROVENANCE.md`).

**Current state: Phase 0, docs only.** The code in this tree is still the Wish Engine. Its working notes and gotchas are in `docs/wish-engine/CLAUDE.md`. The plan and progress are in `docs/ROADMAP.md`.

## Read first
- `docs/README.md`: index and owners
- `docs/MODULE_OWNER_DECISIONS.md`: only the places where the integrated app differs from what a module owner built or intended, or adds new logic, each with its policy setting. Owners review it. **Any new behaviour change that touches another module's work gets an entry here.**
- `docs/ARCHITECTURE.md`, `docs/CONTRACTS.md`, `docs/DATA_MODEL.md`, `docs/API.md`, `docs/SCORING.md`, `docs/DESIGN.md`, `docs/SECURITY.md`, `docs/TESTING.md`
- `docs/modules/*.md`: what was kept, changed and dropped from each branch, and why

## Rules
- **No `Co-Authored-By` or "Generated with Claude Code" lines** in commits or PRs; plain messages. Commit after each stage. Never push without being asked. The remote is `capstone` = `JBarroqu/Capstone_IEEE_Impact`, branch `integration`.
- **Every switchable decision is a policy.**
  - A new choice that another module owner might want differently gets an entry in `docs/MODULE_OWNER_DECISIONS.md` and a key in `backend/app/policies/defaults.py` (every key, including ones not in that doc, is listed with its description in `defaults.py` and on the admin Policies page), implemented as a strategy class whose docstring starts with the decision ID.
  - Business code never compares policy strings; it calls the getter.
  - The register-sync test and the every-choice matrix test must stay green.
- **Module boundaries.** A module imports only another module's `api.py`, never its service, repo or tables (import-linter). Cross-module data uses the versioned contracts in `app/contracts`. Bump `schemaVersion` on any change.
- **Every move is model-generated** (D-29). No catalogue, static moves, cache or fallback moves. The moves prompt keeps exactly one off-topic style example and no worked paths. Bump `PROMPT_VERSION` on any prompt edit. The fake model loads only when `ENV=test`.
- **Design:** only the Event_Ecosystem design (`docs/DESIGN.md`). Tokens live in `frontend/src/design/tokens.css`; no raw hex values in components.
- **Copy:** senior ASU CS students. No emoji. Never "AI" or "smart" in the interface; say moves, options, review, score.
- **Reads never write.** GrowthState is computed from the ledger. Points are append-only and store `rules_version` + `policy_snapshot`.
- **One API worker** (T-11): model health, rate limits and jobs are in memory.
- **Never read `.env` contents.**
