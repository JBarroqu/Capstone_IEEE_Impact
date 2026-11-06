# Deploy

The app runs as one Render web service (API + React build) and one Supabase project (Postgres, Auth, Storage). The Wish Engine's earlier deployment notes are in `docs/wish-engine/DEPLOY.md`.

## Supabase project
1. **Create a project** in the same region as Render (Oregon pairs with `us-west`).
2. **Apply the migrations:**
   ```
   supabase link --project-ref <ref>
   supabase db push
   ```
   This creates the schemas, tables, RLS, the new-user trigger and the storage buckets.
3. **Sign-in settings**, under Authentication:
   - Providers: Email, with password and magic link; Google.
   - URL configuration: Site URL `https://<app>.onrender.com`; redirect URLs `https://<app>.onrender.com/auth/callback` and `http://localhost:5173/auth/callback`.
   - Google: create an OAuth client in Google Cloud. Set the authorized redirect URI to Supabase's callback, `https://<ref>.supabase.co/auth/v1/callback`. Paste the client id and secret into Supabase. (Open question Q5: who owns the Google project.)
   - Email: set a custom SMTP provider before real users arrive. The built-in sender is heavily rate-limited (Q5).
   - Signing keys: use asymmetric keys (ES256). The API verifies with JWKS, and the legacy secret still works as a fallback.
4. **Database connection string.** Open Connect → Shared pooler → **Session mode** (port 5432), copy it, and use it as `DATABASE_URL`. Render has no IPv6, so the direct connection doesn't work there.
5. **Keys.** Copy the URL, the publishable (anon) key, and the secret (service role) key.

## Render service
`render.yaml` defines one Docker web service, `impact-app` (Dockerfile at the repo root):
- a multi-stage build compiles `frontend/` (the `VITE_*` values are build args) and copies the build into the Python image;
- it runs `uvicorn app.main:app --workers 1`, serving the API and the React app on one origin;
- the health check is `/api/v1/health`.

Apply the migrations to the production project first (`supabase link --project-ref <ref> && supabase db push`).

Environment variables:

| Var | Value |
|---|---|
| `DATABASE_URL` | Supabase session-pooler URL |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SECRET_KEY` | service role key (Storage, admin) |
| `SUPABASE_JWT_SECRET` | only if the project uses the legacy HS256 secret |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | build-time, for the browser sign-in |
| `GEMINI_API_KEY` (+ optional `OPENROUTER_API_KEY`, `GROQ_API_KEY`) | model chain |
| `ADMIN_PASSWORD` | 8+ characters, not `change-me` |
| `SESSION_SECRET` | generated; signs the admin cookie and event tickets |
| `PUBLIC_MODE=true`, `TRUST_PROXY=true`, `PROXY_HOPS=1` | |
| any policy key from `backend/app/policies/defaults.py` | optional override |

After the first deploy:
1. Sign up.
2. Check `/admin` → Policies. Every key should show its source.
3. Check `/api/admin/client-ip` with a fake `X-Forwarded-For`. The `ip` should be your real address.

## Costs and sleep
- **Render free web services** sleep after 15 minutes idle; waking takes about a minute. In-memory model health resets on wake.
- **Supabase free projects** pause after a week without activity.

That's fine for development and demos. Use paid tiers for a real cohort (Q6).

## Local development
```
npm run setup          # deps + backend/.venv
npm run db:start       # local Postgres :54322, API :54321, Studio :54323, Mailpit :54324 (magic-link emails)
npm run db:reset       # apply supabase/migrations
npm run api            # FastAPI on :8000
npm run dev            # Vite on :5173, proxies /api to :8000
```
Put the keys `supabase start` prints in a git-ignored `.env.local` (it loads before `.env`). Local auth settings
(redirect URLs, Google provider switched off) are in `supabase/config.toml`; restart Supabase after editing it.

## Google sign-in
Wired but off. To switch it on: create a Google OAuth client (redirect URI `https://<ref>.supabase.co/auth/v1/callback`),
enable Google in Supabase (or `[auth.external.google]` in `supabase/config.toml` locally, with
`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET`), and set `VITE_GOOGLE_AUTH=on` so the button shows.
