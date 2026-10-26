# Going public: what to add back

The prototype runs on the researcher's laptop (or the LAN, during a moderated session), so it has no defences against strangers. Before anyone outside can reach it, restore the layer below. All of it was built and tested (unit tests, e2e through the proxy, curl probes) and then removed for local use. It is kept at git tag **`public-hardening`** (commit `b18115d`).

See it: `git show public-hardening --stat`, or browse any file with `git show public-hardening:lib/rate-limit.ts`.
Restore one file: `git checkout public-hardening -- lib/rate-limit.ts`.

The code around these files has changed since the tag (the prompt is now `moves.v3`, the cache and catalog are gone), so re-apply the route changes by hand instead of checking out whole route files. The diff to follow: `git diff public-hardening HEAD -- app/api`.

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
