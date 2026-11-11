# Roadmap

Each phase ends with `npm test` green and something to demo. Work happens on `integration`; commits are pushed only when asked.

## Phase 0: architecture and docs (done)
- [x] Read every module branch
- [x] Decisions confirmed with the integration lead
- [x] `docs/` set: README, PRODUCT, ARCHITECTURE, MODULE_OWNER_DECISIONS, CONTRACTS, DATA_MODEL, API, SCORING, DESIGN, SECURITY, DEPLOY, TESTING, PROVENANCE, modules/*
- [x] Spike: Render static-site rewrites to an external URL are documented ("Destination can be either a path or a full, publicly accessible URL"), but header and cookie forwarding isn't documented. Decision: keep one origin with the API serving the React build (T-03).
- [x] Spike: Supabase token verification from Python. Use JWKS at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` (ES256/RS256); the legacy HS256 secret still works but isn't recommended (T-04). Connect from Render via the shared pooler in session mode, port 5432, IPv4.
- [x] Spike: local `supabase start` signs tokens with ES256 and serves JWKS, so local and cloud verify the same way.
- [ ] **Module owners review `MODULE_OWNER_DECISIONS.md`** (can happen after the integrated version is built) and mark entries Agreed or Changed

## Phase 1: foundations (done)
- [x] `supabase/` init; migrations for schemas, `core`, RLS deny-all, storage buckets; new-user trigger
- [x] `backend/app` skeleton: config, db, platform (auth, http, security, rate_limit, admin_auth, bus, jobs, storage, events_log)
- [x] `policies/` loader + defaults + sync test (every key named in MODULE_OWNER_DECISIONS exists in defaults.py) + admin policies API
- [x] `contracts/` + schema export + snapshot test (TypeScript types are hand-written in `frontend/src/lib/types.ts`; generating them from the schemas is not set up yet)
- [x] `llm/` moved from the Wish Engine with its tests passing; fake model gated on `ENV=test`
- [x] import-linter boundary contracts
- [x] Vite + React 19 app: tokens, AppShell, sign-in (password, magic link, Google), guards, `/me`
- [x] Dockerfile, `render.yaml`, CI
- **Demo:** sign up three ways and see the empty shell; the API returns 401 without a token.

## Phase 2: Profile (Module 1) (done)
- [x] Tables, service, GET/PUT, handle check, ProfessionalState contract
- [x] Onboarding stepper; resume import → draft → review
- **Demo:** sign up, then onboard from a resume, then Home.

## Phase 3: Wish (Module 2) (done)
- [x] Routes re-keyed by user; `moves.v5` with profile, tags and outcomes; select → SelectedMove; gate
- [x] Flow ported to React and restyled; event log and admin dashboard re-keyed
- **Demo:** a wish produces profile-fitted options with skill tags, and a move is locked.

## Phase 4: Growth (Module 3) (done)
- [x] `catalog.json`; ScoringRules v1.0 + v1.1; `compute_growth_state`; GrowthState contract
- [x] Evidence upload to Storage; rubric on the shared chain; pending points; Growth page
- **Demo:** submit evidence, get the rubric breakdown and pending points.

## Phase 5: Buddies (Module 4) (done)
- [x] Invitations state machine with mike's 14 cases; lookup; review queue; feedback → SocialEvidence → finalise
- [x] 7-day timeout job; `VALIDATION_MODE` matrix
- **Demo:** two users; review and confirm; points finalise.

## Phase 6: Feed and Home (Module 5) (done)
- [x] Event subscribers; `/feed`, `/home`; EventContext; best next move; Home in the Event_Ecosystem layout
- [x] Close the loop: next move ready → move 2 with outcome context
- **Demo:** the full loop through move 2, with the feed updating at every step.

## Phase 7: hardening and launch
- [x] CSP, rate limits on model, upload, lookup and write routes, admin policies page and endorsements
- [ ] Security review
- [x] Production Docker image (API + React build on one origin) and `render.yaml`
- [ ] Supabase production project, Render deploy, Google OAuth client, SMTP, smoke e2e against production
- [ ] `MODULE_OWNER_DECISIONS.md` statuses updated after owner review
