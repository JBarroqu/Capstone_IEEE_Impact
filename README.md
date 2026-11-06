# Impact++

Five IEEE capstone modules joined into one product: a student describes where they are now (Professional State), turns
a wish into one concrete move at a time (Wish Engine), shows evidence that's scored and confirmed by a buddy (Growth +
Buddies), and comes back to a feed of what changed (Events). One React app, one FastAPI service, one Supabase project.

**Start here:** [docs/README.md](docs/README.md). Module owners: [docs/MODULE_OWNER_DECISIONS.md](docs/MODULE_OWNER_DECISIONS.md)
lists every place the integrated app differs from what you built, with the setting that switches it.

## Run it locally
Needs Docker (for local Supabase), the Supabase CLI (`brew install supabase/tap/supabase`), Node 20+, Python 3.13.

```
npm run setup          # node deps (root + frontend) and backend/.venv
npm run db:start       # local Supabase: Postgres, Auth, Storage, Mailpit (magic-link emails at http://127.0.0.1:54324)
npm run db:reset       # apply supabase/migrations
```
Put the values `supabase start` prints into `.env.local` (git-ignored; see `.env.example`), and your `GEMINI_API_KEY`
and `ADMIN_PASSWORD` into `.env`. Then, in two terminals:
```
npm run api            # FastAPI on :8000 (API docs at /docs)
npm run dev            # React on http://localhost:5173 (proxies /api to :8000)
```
Or build once and let the API serve everything on one origin, as in production: `npm run build && npm start`
(http://localhost:8000). Admin is at `/admin`.

## Test
```
npm test               # frontend unit tests + typecheck, backend pytest (integration tests need db:start), import-linter
npm run e2e:serve      # (separate terminal) app with the test-only fake model on :8000
npm run e2e            # two users through the whole product in headless Chrome
npm run llm:check      # one live call through the real model chain
```

## Deploy
Render (one Docker web service) + a Supabase project: [docs/DEPLOY.md](docs/DEPLOY.md).
