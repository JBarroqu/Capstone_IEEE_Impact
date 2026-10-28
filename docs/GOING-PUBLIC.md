# Going public: what to add back

The prototype runs on the researcher's laptop (or the LAN, during a moderated session), so it has no defences against strangers. Before anyone outside can reach it, restore the layer below. All of it was built and tested (unit tests, e2e through the proxy, curl probes) and then removed for local use. It is kept at git tag **`public-hardening`** (commit `b18115d`).

See it: `git show public-hardening --stat`, or browse any file with `git show public-hardening:lib/rate-limit.ts`.
Restore one file: `git checkout public-hardening -- lib/rate-limit.ts`.

**The backend has since moved to FastAPI (`backend/wish_api`), so the tag's code is TypeScript and has to be ported, not checked out.** Use it as the reference implementation: the logic, limits and tests carry over directly. Where each piece goes now:

| At the tag (TypeScript) | Port to (FastAPI) |
|---|---|
| `lib/rate-limit.ts` + `limited()` calls | a `wish_api/rate_limit.py` token bucket, called at the top of each route (or a dependency) |
| `lib/session-auth.ts`, `lib/secret.ts` | `wish_api/session_auth.py`; `/api/session` sets the cookie, other routes check it. The frontend then needs `credentials: "include"` on every call (already set in `lib/client-api.ts`, not yet on `lib/track.ts`, whose text/plain beacons send cookies anyway) |
| `lib/admin-auth.ts` (signed, expiring) | `wish_api/admin_auth.py` |
| `lib/request.ts` `readJson` | `routes/common.py` `read_json` (add the byte cap there) |
| `headers()` in `next.config.mjs` | still Next for pages; add the same headers to API responses with a FastAPI middleware |
| `Caddyfile` + compose `proxy` | in front of **both** apps, or a platform proxy (Vercel for pages, the API host's proxy) |

**New with separate origins:**
- Set `CORS_ORIGINS` to the exact frontend origin(s). The default regex allows every localhost and private LAN address.
- Keep frontend and API on one registrable domain (`app.example.com` + `api.example.com`) so the admin cookie stays same-site. On unrelated domains it becomes a third-party cookie, which Safari blocks.
- Set `NEXT_PUBLIC_API_URL` to the public API URL at build time.

## The layer, in the order to restore it

| # | Piece | Files at the tag | What it protects against |
|---|---|---|---|
| 1 | **Signed session cookie** | `lib/session-auth.ts`, `lib/secret.ts`; checks in `app/api/{options,classify,wish,events}/route.ts`; `/api/session` sets it; `lib/client-api.ts` `startSession` / `whenSessionReady` and `lib/track.ts` `setReady` make calls wait for it | Strangers posting fake sessions, wishes and events into the study data, or calling the models without going through consent. A wish can only be updated by the session that made it (`setWhere`). |
| 2 | **Rate limits** | `lib/rate-limit.ts` (+ `tests/rate-limit.test.ts`), one `limited(...)` call at the top of each route | Scripts using up the Gemini quota, and brute-forcing admin login (10 tries per 15 min). Per IP, per session, plus global ceilings that hold even with faked IPs. |
| 3 | **Reverse proxy that owns `X-Forwarded-For`** | `Caddyfile`, `proxy` service in `docker-compose.yml`, app port not published | Next passes a client's own `X-Forwarded-For` straight through (tested), so without a proxy the per-IP limits can be dodged. On Vercel or behind Cloudflare the platform does this instead; use its client-IP header. |
| 4 | **HTTPS for admin** | Caddy `tls internal` on :3443; the login route refuses plain http from non-local addresses (`ADMIN_ALLOW_HTTP` override) | Admin password and cookie sent unencrypted over a network. In public, use a real certificate (Vercel, Caddy with a domain, Cloudflare) and redirect all http to https. |
| 5 | **Signed, expiring admin cookie** | `lib/admin-auth.ts`, `app/api/admin/login/route.ts` | The current cookie is `sha256(password)`: it never expires and is the same for every login. The tagged version is an HMAC with a server-side 12 h expiry, `SameSite=Strict`, signs everyone out when the password changes, and refuses empty/`change-me`/short passwords. |
| 6 | **Body size caps** | `lib/request.ts` `readJson(req, maxBytes)` | Huge request bodies. Every route reads its body through it (1–64 KB). The zod `.max()` limits on fields are still in place. |
| 7 | **Security headers** | `headers()` in `next.config.mjs` | Clickjacking and MIME sniffing: CSP `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, no `X-Powered-By`. Add HSTS once everything is https. |
| 8 | **Env-driven DB password** | `POSTGRES_PASSWORD` in `docker-compose.yml` | Only matters if the database port is ever exposed. A hosted Postgres (Neon, Supabase) sets its own. |

The tagged `docs/SECURITY.md` has the full write-up with the tested behaviour: `git show public-hardening:docs/SECURITY.md`.

## Not built yet, needed for a public launch

- **Gemini paid tier.** Free-tier prompts may be used by Google and reviewed by people, and the daily caps would run out quickly with real traffic.
- **Accounts or invite links** instead of "type any name". Participant codes are names today.
- **Persistent rate-limit and health state** (Postgres or Redis), if more than one instance runs. Today they are in memory.
- **Data retention and deletion:** a way for a participant to have their data deleted, and an automatic retention window.
- **Monitoring:** error alerts, and a dashboard of model failure rate.
- **Abuse filtering** of free text before it reaches the model or the admin page, if the audience is no longer a moderated study.
