# CI/CD

GitHub Actions checks every pull request and push, and deploys only commits that passed every check.

```
PR or push ──► CI ─────────────────────────────────────────────┐
               ├ Frontend: ESLint, types, Vitest, build        │  all green
               ├ Backend: ruff, import boundaries, pytest,      ├──► "CI passed"
               │          contract schemas                     │
               ├ Integration + e2e: real Supabase, the         │
               │          integration tests,                   │
               │          two users in Chrome (2 policy sets)  │
               └ Image: build the Docker image, smoke-run it   ┘
                                                                  │ push to integration     │ push to main
                                                                  ▼                         ▼
                                                           Deploy staging         (approval) Deploy production
                                                           migrations → Render exact commit → wait until live → smoke test

PR or push ──► Security: CodeQL, gitleaks, npm/pip audit, Trivy image scan ──► "Security passed"   (also weekly)
Nightly    ──► Live model check (real Gemini) ──► opens an issue when it fails, closes it when it passes
Weekly     ──► Dependabot PRs into integration (releases at least 14 days old)
```

## Workflows

| File | Runs on | What it does |
|---|---|---|
| `.github/workflows/ci.yml` | every PR; pushes to `main` and `integration`; merge queue; by hand | All checks below, then the deploy for that branch. The gate job **CI passed** is the one check branch protection needs. |
| `.github/workflows/deploy.yml` | called by CI; by hand (Actions → Deploy → Run workflow) | Deploys one environment. |
| `.github/workflows/security.yml` | every PR; pushes; Mondays 06:17 UTC; by hand | Security checks. Gate job: **Security passed**. |
| `.github/workflows/llm-check.yml` | daily 13:23 UTC; by hand | `npm run llm:check -- --all` against the real models. |
| `.github/dependabot.yml` | weekly | Update PRs for npm, pip, Actions and the Docker base images. |

### CI jobs (run in parallel)
- **Frontend**
  - `npm run lint` (ESLint: TypeScript's recommended rules and the rules of hooks; no style rules)
  - `tsc` for the app and the e2e script
  - Vitest, including the copy rules
  - a production build
- **Backend**
  - `ruff check` (correctness rules only; no formatter, so code keeps its layout)
  - import-linter (module boundaries)
  - pytest without the integration folder
  - checks that `contracts/schemas` matches the code (run `npm run schemas` and commit if not)
- **Integration + e2e**
  - Starts local Supabase in the runner (`scripts/ci/start-supabase.sh`), which applies every migration to a fresh database. Studio, realtime and logging are skipped to save time; start-up is retried up to 3 times.
  - Lints the schema (`supabase db lint`).
  - Runs the integration tests with `REQUIRE_SUPABASE=1`, so a database that didn't start **fails** the run instead of skipping it.
  - Runs `e2e/full-loop.ts` twice, through `scripts/ci/run-e2e.sh`: once with the defaults, and once with the module owners' original choices (`BUDDY_DISCOVERY=search SURVEY_SCREENS=on MOVE_TAGS_SOURCE=user ONBOARDING_REQUIRED=false OPPORTUNITY_CHIP=events_pro`). The script refuses a port that's already in use, and checks that the settings really took effect before testing.
  - When it fails, screenshots and server logs are uploaded as the `e2e-artifacts` artifact (kept 7 days).
- **Image**
  - Builds the production Dockerfile and runs it the way Render does.
  - `scripts/ci/wait-for-deploy.sh` then checks `/health` reports the commit, the app page loads, `/config` answers, `/me` is 401 signed out, and the API docs are off.

### Deploy (`deploy.yml`)
1. **Skips itself** if a newer commit is already on the branch. Every commit gets its own CI run, and they can finish out of order; this stops an older commit from deploying over a newer one.
2. Checks the environment has all its settings, and names any that are missing.
3. Lists, then applies, pending migrations to that environment's Supabase project (`supabase db push --remote=<ref> --skip-vault`). If a migration fails, the deploy stops before the app changes.
4. Calls the Render deploy hook with `&ref=<commit>`, so Render builds exactly the commit that passed. Render's own auto-deploy is off (`render.yaml`).
5. Waits, for up to 30 minutes, until `/api/v1/health` reports that commit (Render sets `RENDER_GIT_COMMIT`). Then it runs the same smoke checks as the Image job.
6. Production waits for an approval before step 1 (GitHub environment protection).

If a new version fails Render's health check, Render keeps serving the previous one. The deploy job then times out at step 5 and fails, which shows up in Actions.

### Audit levels
- **Packages that ship** (npm `--omit=dev`, `backend/requirements.txt`, the image) fail on moderate or worse. For pip and the image, any known vulnerability with a fix available fails.
- **Build and test tools** (npm dev dependencies) fail on high or worse. The current ESLint toolchain has one moderate advisory (`minimatch`, GHSA-g3hv-75wg-m249). It is dev-only, and its fixed versions are too new to adopt yet.
- **Image scan (Trivy)** fails on HIGH or CRITICAL issues that have a fix. The Dockerfile applies Debian security updates and removes pip from the final image.
- **To accept a finding:** add it to `.trivyignore` with a reason and a review date, or fix it with a dependency bump.

## One-time setup (repository admin)

Do these once, in order. Steps 1–3 are outside GitHub.

1. **Default branch.** Dependabot and scheduled workflows (the weekly security scan, the nightly model check) only run from the repository's default branch (`main`). They start once these files reach `main`. CI and deploys work from `integration` straight away.
2. **Supabase:** two projects, `impact-staging` and `impact-production` (docs/DEPLOY.md lists the auth and URL settings for each).
   - For each, note the **project ref** (the id in its URL) and the **database password**.
   - Create one **access token** at supabase.com/dashboard/account/tokens.
   - Add each app's URL to that project's Auth redirect URLs.
3. **Render:** New → Blueprint → this repository.
   - This creates `impact-app` (from `main`) and `impact-app-staging` (from `integration`). Fill in each service's environment values from its own Supabase project.
   - Then open each service → Settings → **Deploy Hook**, and copy the URL.
4. **GitHub environments:** Settings → Environments. Create both:

   | Environment | Deployment branches | Protection | Variables | Secrets |
   |---|---|---|---|---|
   | `staging` | `integration` only | none | `APP_URL`, `SUPABASE_PROJECT_REF` | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `RENDER_DEPLOY_HOOK_URL` |
   | `production` | `main` only | Required reviewers (at least one person besides the pusher) | same | same, with production values |

   The same with `gh`, from the repo folder (each `secret set` prompts for its value, so nothing lands in your shell history):
   ```
   for env in staging production; do gh api -X PUT "repos/{owner}/{repo}/environments/$env" >/dev/null; done
   gh variable set APP_URL --env staging --body https://impact-app-staging.onrender.com
   gh variable set SUPABASE_PROJECT_REF --env staging --body <staging-ref>
   gh secret set SUPABASE_ACCESS_TOKEN --env staging
   gh secret set SUPABASE_DB_PASSWORD --env staging
   gh secret set RENDER_DEPLOY_HOOK_URL --env staging
   # repeat for --env production with production values; then add required reviewers and branch rules in the UI
   ```
5. **Repository secrets** (Settings → Secrets and variables → Actions) for the nightly model check: `GEMINI_API_KEY`, plus optional `OPENROUTER_API_KEY` and `GROQ_API_KEY`.
6. **Branch rules** (Settings → Rules → New branch ruleset):
   - `main`:
     - require a pull request with 1 approval;
     - require the status checks **CI passed** and **Security passed**;
     - block force pushes and deletion.
   - `integration`: block force pushes and deletion. Direct pushes stay allowed, and staging still only deploys commits that pass. To make PRs mandatory here too, add the same two required checks.
7. **Security features** (Settings → Code security; free for public repositories): turn on Dependabot alerts, secret scanning and push protection. CodeQL results appear under Security → Code scanning.

## Day to day
- **Before pushing:** `npm run lint && npm test`. The integration tests need `npm run db:start`.
- **To reproduce the CI e2e:**
  1. Build with `npm run build`.
  2. Run `scripts/ci/run-e2e.sh default`.
  3. Run it again with policies, e.g. `scripts/ci/run-e2e.sh originals BUDDY_DISCOVERY=search`.

  It uses port 8000 unless you set `E2E_PORT` (also allowed: 4173 and 5173), and refuses a port already in use.
- **When an e2e run fails in CI:** download `e2e-artifacts` from the run's summary page. It has a screenshot of each page at the point of failure and the server log.
- **Redeploy or roll back:**
  - **Instant:** Render → service → Deploys → Rollback on an earlier deploy.
  - **Through the pipeline:** Actions → Deploy → Run workflow. Pick the branch and environment, and tick *skip migrations* when going back to an older commit.
  - Migrations only move forward. Write them so the previous app version still works (add columns before using them; drop them in a later release).
- **Model check issue:** when the `llm-check` issue opens, run `npm run llm:check -- --all` locally to see which models answer. Pin working ones with `GEMINI_MODELS` on Render if needed. The issue closes itself on the next passing run.
- **Updating a pinned Action or tool:** Actions are pinned to full commit SHAs, with the version in a comment, and Dependabot proposes updates. The Supabase CLI version is pinned in `ci.yml` and `deploy.yml` (`3.0.0`); keep it in step with what the team runs locally.
