# Deploying on the internet

`docker-compose.public.yml` runs the whole app on one server behind Caddy, on one https domain. It is a separate stack from the local `docker-compose.yml` (its own project name, so its own database).

```
Browser ──https──> Caddy (:443, :80 redirects) ──/api/*──> api (FastAPI, 1 worker)
                                               └──else───> app (Next.js)       both ──> db (Postgres, not published)
```

Only Caddy is published. Pages and API share the origin `https://DOMAIN`, so there is no CORS and the cookies are first-party.

## What you need

- A Linux server with Docker (any small VPS: 1 vCPU, 1–2 GB RAM is enough), ports 80 and 443 open.
- A domain or subdomain with a DNS `A` record pointing at the server (`wish.example.com`). Caddy gets and renews a Let's Encrypt certificate on first start; that needs the DNS record and port 80 reachable.
- A Gemini API key on a **paid** tier for real traffic (see "Before real participants").

## Steps

1. Copy the repo to the server and create `.env` from `.env.example`. Set at least:
   ```
   DOMAIN=wish.example.com
   POSTGRES_PASSWORD=<long random string>        # openssl rand -hex 24
   ADMIN_PASSWORD=<8+ characters, not change-me>
   SESSION_SECRET=<long random string>           # optional; default is a random key kept in the database
   GEMINI_API_KEY=...
   ```
   `DATABASE_URL`, `PUBLIC_MODE`, `TRUST_PROXY` and `CORS_ORIGINS` are set by the compose file.
2. Start it:
   ```
   docker compose -f docker-compose.public.yml up -d --build
   docker compose -f docker-compose.public.yml logs -f proxy api   # certificate and API logs
   ```
3. Open `https://DOMAIN`, do a dry run as `TEST <name>`, check `https://DOMAIN/admin`, then delete the test session from the admin page.

Updates: `git pull`, then the same `up -d --build`. Stop: `docker compose -f docker-compose.public.yml down` (data stays in its volume). Backups: `docker compose -f docker-compose.public.yml exec -T db pg_dump -U wish wish_engine | gzip > backup.sql.gz`.

**Trial run on a laptop:** `DOMAIN=localhost POSTGRES_PASSWORD=anything docker compose -f docker-compose.public.yml up -d --build`, then `https://localhost` (Caddy's own certificate; accept the warning) and `BASE_URL=https://localhost npx tsx scripts/e2e.ts`. Remove it with `... down -v`.

## What public mode turns on

| Piece | Where |
|---|---|
| Signed session cookie: `/api/session` (after consent) sets it; options, classify, questions, wish and events refuse requests without it (401) or with a body `sessionId` that does not match. A wish can only be changed by the session that created it. | `backend/wish_api/security.py`, `routes/student.py`; the client waits for it (`lib/client-api.ts` `whenSessionReady`, `lib/track.ts` `setReady`) |
| Rate limits per IP, per session and global, `429` with `Retry-After` | `backend/wish_api/rate_limit.py` |
| Real client IP: Caddy overwrites `X-Forwarded-For`; the API trusts it only with `TRUST_PROXY` | `Caddyfile.public`, `security.py` `client_ip` |
| HTTPS everywhere, http redirected, HSTS | Caddy |
| Signed admin cookie: HMAC, 12 h server-side expiry, `SameSite=Strict`, signs everyone out when the password changes; login refused with an empty, `change-me` or short password, and over plain http from another machine | `backend/wish_api/admin_auth.py`, `routes/admin.py` |
| Body caps: 128 KB at Caddy, 1–64 KB per route in the API | `Caddyfile.public`, `routes/common.py` `read_json` |
| Security headers (CSP `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`), no `X-Powered-By` | `next.config.mjs`, `backend/wish_api/main.py` |
| API docs pages (`/docs`, `/openapi.json`) off | `main.py` (`PUBLIC_MODE`) |
| Database not published, password from `.env` | `docker-compose.public.yml` |

The cookie checks, rate limits, body caps and headers are also on in the local stack; only the proxy, HTTPS, HSTS, trusted forwarding headers and docs switch-off are public-mode only. Limits and their reasons: `docs/SECURITY.md`.

## Before real participants

See `docs/GOING-PUBLIC.md` for what is still missing (paid model tier, accounts instead of names, data deletion, monitoring).
