# Deploy

There is one environment for now, **production**: the Render web service `impact-app` (API + React build) and the
Supabase project `impact-production` (Postgres, Auth, Storage). Every commit that passes CI on `main` deploys to it
after an approval. GitHub Actions runs the deploy ([CI_CD.md](CI_CD.md)). Staging can be added later (see "Adding
staging later"); until then the staging deploy step is skipped. The Wish Engine's earlier deployment notes are in
`docs/wish-engine/DEPLOY.md`.

## First deploy, in order

### 1. Supabase project
In the Supabase dashboard, supabase.com/dashboard. You don't create any tables: the first deploy applies
`supabase/migrations`.

1. **Create the project.**
   1. Click **New project** and pick your organization.
   2. Name: `impact-production`.
   3. Database password: click **Generate a password** and copy it somewhere safe. It is not shown again.
   4. Region: **West US (Oregon)**.
   5. Click **Create new project** and wait for it to finish setting up.
2. **Don't link it to GitHub.** The pipeline applies migrations. If you already linked it: **Project Settings** →
   **Integrations** → **GitHub Integration** → **Disable integration**.
3. **Signing keys.** **Project Settings** → **JWT Keys**. If the current key says **Legacy HS256**, click
   **Migrate JWT secret**, then **Rotate keys**, so the current key is ES256.
4. **Redirect URLs** (after step 2 below gives you your app's address).
   1. **Authentication** → **URL Configuration**.
   2. **Site URL:** `https://<your-app>.onrender.com`. Click **Save**.
   3. Under **Redirect URLs**, click **Add URL**, enter `https://<your-app>.onrender.com/**`, and click **Save URLs**.
5. **Copy these values:**

   | Value | Where in Supabase | Goes into |
   |---|---|---|
   | Project ref | the id in the dashboard URL, `supabase.com/dashboard/project/<ref>` | GitHub **environment variable** `SUPABASE_PROJECT_REF` |
   | Project URL | the project's home page: the address under the project name → **Copy**. Exactly `https://<ref>.supabase.co`, nothing after `.co` (not the Data API address ending in `/rest/v1`: sign-up then fails with "Failed to fetch") | Render `SUPABASE_URL` and `VITE_SUPABASE_URL` |
   | Publishable key | **Project Settings** → **API Keys** | Render `VITE_SUPABASE_PUBLISHABLE_KEY` |
   | Secret key | **Project Settings** → **API Keys** | Render `SUPABASE_SECRET_KEY` |
   | Session pooler string | **Connect** (top bar) → **Direct** tab ("Connection string") → choose **Session pooler**, the string with `pooler.supabase.com:5432` (not the direct one, `db.<ref>.supabase.co`, which needs IPv6); replace `[YOUR-PASSWORD]` with the database password | Render `DATABASE_URL` |
   | Database password | from step 1 | GitHub **environment secret** `SUPABASE_DB_PASSWORD` |
   | Access token | supabase.com/dashboard/account/tokens → **Generate new token**. Projects: only `impact-production`. Permissions: Migrations read-write; Database, Database config, Connection pooling and Project read; nothing else. Expiry: **Never** or the longest offered (an expired token fails every deploy at the migration step) | GitHub **environment secret** `SUPABASE_ACCESS_TOKEN` |

### 2. Render service
In the Render dashboard, dashboard.render.com.

1. Click **New** (top right) → **Blueprint**.
2. Connect GitHub if asked, choose `waleedalfar/Capstone_IEEE_Impact`, branch `main`, and name the Blueprint `impact`.
3. Render lists `impact-app` and asks for its values. Fill them in from this table:

   | Var | Value |
   |---|---|
   | `DATABASE_URL` | Supabase session pooler string |
   | `SUPABASE_URL`, `VITE_SUPABASE_URL` | Supabase project URL |
   | `SUPABASE_SECRET_KEY` | Supabase secret key |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
   | `GEMINI_API_KEY` | from aistudio.google.com/apikey |
   | `OPENROUTER_API_KEY` | leave empty unless you use OpenRouter |
   | `ADMIN_PASSWORD` | 8+ characters, not `change-me` |

   The rest (`SESSION_SECRET`, `PUBLIC_MODE`, `TRUST_PROXY`, `PROXY_HOPS`, `VITE_GOOGLE_AUTH`) is set by the Blueprint.
4. Click **Deploy Blueprint**. A failed first build is fine; the pipeline deploys it in step 4.
5. **Your app's address:** open `impact-app`; it's the link under the name at the top of the page. Render addresses
   are unique across all of Render, so it is usually `impact-app-` plus a few characters, not `impact-app.onrender.com`
   (that one belongs to someone else). Below, `<your-app>.onrender.com` means this address.
6. Open `impact-app` → **Settings**:
   1. **Instance Type** must be **Free** (change it and click **Save changes** if not).
   2. **Deploy Hook** → **Copy**. It goes into the GitHub **environment secret** `RENDER_DEPLOY_HOOK_URL` in step 3.
7. If Render also created `impact-app-staging` (an older version of `render.yaml` had it), delete it: open it →
   **Settings** → **Delete Web Service** at the bottom. It has no database and would fail every build.

### 3. GitHub environment
On github.com: the repository → **Settings** → **Environments** → `production`.
1. Under **Environment variables**, click **Add environment variable** twice:
   - `APP_URL` = `https://<your-app>.onrender.com`
   - `SUPABASE_PROJECT_REF` = the project ref
2. Under **Environment secrets**, click **Add environment secret** three times:
   - `SUPABASE_ACCESS_TOKEN` = the Supabase access token
   - `SUPABASE_DB_PASSWORD` = the database password
   - `RENDER_DEPLOY_HOOK_URL` = the deploy hook

Leave the `staging` environment empty, and don't create a `STAGING_ENABLED` variable.

### 4. Deploy
1. On github.com, open the repository → **Actions** tab.
2. In the left list, click **Deploy**.
3. Click **Run workflow** (right side), leave the branch as `main`, choose environment `production`, and click the
   green **Run workflow** button.
4. Open the run that appears. It pauses at "Waiting for review": click **Review deployments**, tick `production`,
   and click **Approve and deploy**.
5. It then checks the settings, shows the pending migrations (dry run), applies them, calls the deploy hook with the
   commit, and waits until `/api/v1/health` reports that commit. A free Render service can take several minutes on
   its first build.
6. If a step fails, click it to read the error. "environment is missing …" names the variable or secret to add in
   step 3. A permission (403) error in the migration step names a permission the access token lacks: generate a new
   token with it added (a token's scope can't be edited) and replace `SUPABASE_ACCESS_TOKEN`.

After this, every merge to `main` runs CI, then waits for the same approval (step 4) before deploying.

### 5. Check the running app
1. Open `https://<your-app>.onrender.com` and sign up with a real email address.
2. Click the link in the confirmation email (it comes from Supabase's built-in sender, so check spam).
3. Finish onboarding and create a wish, to confirm the model keys work.
4. Open `/admin`, sign in with `ADMIN_PASSWORD`, then open **Policies**. Every key shows its source.
5. In a terminal, run `curl -H "X-Forwarded-For: 1.2.3.4" https://<your-app>.onrender.com/api/admin/client-ip`.
   The `ip` shown should be your real address, not `1.2.3.4`.

### 6. Before real users
1. **Email:** the built-in sender allows only a few emails an hour (Q5).
   1. Sign up with an email provider (for example Resend or Postmark), verify your sending domain, and create SMTP
      credentials.
   2. In Supabase: **Authentication** → **Emails** → **SMTP Settings** → **Enable custom SMTP**.
   3. Enter the host, port, username, password and sender address, then click **Save**.
2. **Google sign-in** (optional): see below.

## What protects production without staging
- A merge needs a PR, an approval, and both **CI passed** and **Security passed** (the `main` ruleset).
- CI applies every migration to a fresh local Supabase, lints the schema, and runs the integration and browser tests
  against it.
- Each deploy waits for an approval, applies migrations before the new code starts, and stops before deploying if a
  migration fails.
- What staging would add: trying the migrations and the new code on a hosted copy before real data. Until it exists,
  write migrations that only add (new tables, new nullable columns) and check the dry-run step in each deploy log.

## Adding staging later
1. Create a second Supabase project, `impact-staging`, with step 1 (Site URL `https://impact-app-staging.onrender.com`).
   Generate a new access token scoped to both projects and replace `SUPABASE_ACCESS_TOKEN` in `production` too.
2. In `render.yaml`, copy the `impact-app` service as `impact-app-staging` and merge that. In Render, open the
   Blueprint → **Manual Sync**, fill in the staging values, and copy its deploy hook.
3. Fill in the GitHub `staging` environment with step 3 (`APP_URL` = `https://impact-app-staging.onrender.com`).
4. Run the Deploy workflow (step 4) with `staging`.
5. Turn it on: the repository → **Settings** → **Secrets and variables** → **Actions** → **Variables** tab →
   **New repository variable**, name `STAGING_ENABLED`, value `true`. From then on each merge deploys staging first,
   and production only after staging succeeds.

## Applying migrations by hand
Normally the deploy workflow does this. If you need to (CLI v3: without `--remote`, `db push` targets your *local*
database):
```
supabase db push --remote=<ref> --password <db-password> --dry-run   # shows what would run
supabase db push --remote=<ref> --password <db-password>
```

## How the service runs
- A multi-stage build compiles `frontend/` (the `VITE_*` values are build args) and copies it into the Python image.
- It runs `uvicorn app.main:app --workers 1`, serving the API and the React app on one origin (T-03, T-11).
- The health check is `/api/v1/health`; it reports the deployed commit.

## Costs and sleep
Everything runs at $0: a Render **Hobby** workspace with `impact-app` on the `free` instance, and a free Supabase
project.
- **Render free web services** sleep after 15 minutes idle; waking takes about a minute. In-memory model health resets on wake.
- **Render free hours:** 750 a month per workspace. Sleeping services don't use them.
- **Keep awake:** `.github/workflows/keep-awake.yml` pings production every 10 minutes from 7am to midnight Arizona
  time, so daytime visitors don't wait for a wake-up. That uses about 530 of the 750 hours. GitHub can run it late,
  and turns it off after 60 days without a commit (re-enable it under **Actions** → **Keep awake** →
  **Enable workflow**). It pings nothing until you set the address: the repository → **Settings** → **Secrets and
  variables** → **Actions** → **Variables** tab → **New repository variable**, name `KEEP_AWAKE_URL`, value
  `https://<your-app>.onrender.com`.
- **Supabase free projects** pause after a week without activity. The keep-awake ping doesn't touch the database, so
  a quiet week can still pause it; restore it from the project page (**Restore project**).

That's fine for development and demos. Use paid tiers for a real cohort (Q6).

## Local development
```
npm run setup          # deps + backend/.venv
npm run db:start       # local Postgres :54322, API :54321, Studio :54323, Mailpit :54324 (magic-link emails)
npm run db:reset       # apply supabase/migrations
npm run api            # FastAPI on :8000
npm run dev            # Vite on :5173, proxies /api to :8000
```
`npm run db:start` also runs `scripts/env-local.mjs`, which reads `supabase status` and writes `DATABASE_URL`,
`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` into the git-ignored
`.env.local` (it loads before `.env`; other keys in it are kept). Run `npm run env:local` to regenerate it. You add only
`GEMINI_API_KEY` and `ADMIN_PASSWORD` to `.env` yourself. Local auth settings
(redirect URLs, Google provider switched off) are in `supabase/config.toml`; restart Supabase after editing it.

## Google sign-in
Wired but off (Q5: who owns the Google project). To switch it on for one environment:
1. **Google Cloud**, console.cloud.google.com:
   1. Pick or create a project.
   2. **APIs & Services** → **OAuth consent screen**: choose **External**, fill in the app name and support email,
      and save.
   3. **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
   4. Application type **Web application**. Under **Authorized redirect URIs**, add
      `https://<ref>.supabase.co/auth/v1/callback`.
   5. Click **Create**, then copy the client ID and client secret.
2. **Supabase:** **Authentication** → **Sign In / Providers** → **Google**. Turn it on, paste the client ID and secret,
   and click **Save**.
3. **Render:** open the service → **Environment**, set `VITE_GOOGLE_AUTH` to `on`, then **Save, rebuild, and
   deploy**. This is a build-time value, so the button appears only after the rebuild.

Locally:
1. In `supabase/config.toml`, under `[auth.external.google]`, set `enabled = true`.
2. Put `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in `.env`. The client also
   needs `http://127.0.0.1:54321/auth/v1/callback` as an authorized redirect URI.
3. Set `VITE_GOOGLE_AUTH=on` in `.env`.
4. Restart Supabase: `npx supabase stop && npm run db:start`.
