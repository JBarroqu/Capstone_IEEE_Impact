# Security and reliability

Two ways to run: locally (`docker-compose.yml`, the researcher's laptop or the LAN during a moderated session) and publicly (`docker-compose.public.yml`, one https domain behind Caddy; `docs/DEPLOY.md`). The checks below run in both unless marked public.

## How a request is checked

1. **Caddy** (public) is the only thing reachable. It terminates https, redirects http, caps bodies at 128 KB, and replaces any `X-Forwarded-For` the client sent with the real address. The API trusts forwarding headers only with `TRUST_PROXY` (on in public mode); otherwise it uses the socket address, so a client can't pick its own rate-limit key.
2. **Rate limits** (`backend/wish_api/rate_limit.py`): token buckets per IP, per session and globally. Over the limit: `429 {reason:"rate_limited", retry_after_s}` with `Retry-After`; the client backs off and retries. `RATE_LIMIT=false` turns them off.
3. **Body size cap** (`routes/common.py` `read_json`): 1–64 KB per route, checked on `Content-Length` and on the bytes read. Pydantic models cap every array and string.
4. **Signed session cookie** (`security.py`): `/api/session` requires `consented: true` and a non-empty name, then sets `wish_sess = sessionId.issuedAt.HMAC` (httpOnly, `SameSite=Lax`, 12 h, `Secure` over https). `/api/options`, `/api/classify`, `/api/questions`, `/api/wish` and `/api/events` refuse requests without it (`401 no_session`) or with a body `sessionId` that does not match. A wish can only be updated by the session that created it.
5. **Signing key:** `SESSION_SECRET`, or a random key created once and kept in the `settings` table, so cookies survive restarts.
6. **Admin** (`admin_auth.py`): login is refused (503) while `ADMIN_PASSWORD` is empty, `change-me` or under 8 characters, and (403) over plain http from another machine unless `ADMIN_ALLOW_HTTP=true`. The cookie is `HMAC(secret, admin + password fingerprint + issuedAt)`, expires on the server after 12 h, is `SameSite=Strict`, and stops working when the password changes. 10 login tries per IP per 15 min.
7. **Headers:** pages and API send CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`; no `X-Powered-By`. Public adds HSTS and turns off the API docs pages.

| Route | Per IP | Per session | Global |
|---|---|---|---|
| `/api/options` (models) | 120/min | 20/min | 300/min |
| `/api/classify`, `/api/questions` (models) | 60/min | share the 20/min | 200/min each |
| `/api/events` | 600/min | 60 batches/min | – |
| `/api/wish` | 300/min | cookie required | – |
| `/api/session` | 30/min | – | 120/min |
| `/api/admin/login` | 10 per 15 min | – | – |
| `/api/admin/models` | 6/min | – | – |

Per-IP limits are loose because a lab can share one campus NAT address. The global limits hold even if someone fakes IPs.

## Also in place

- **CSV exports** prefix text cells starting with `= + - @` (or tab/CR) with `'`, so student text can't run as a spreadsheet formula.
- **Delete TEST sessions** only matches `^TEST[ _-]` (case-sensitive). It shows the count and codes first, refuses if the list changed, and runs in a transaction.
- **Model reliability:** each Gemini model is held to `GEMINI_RPM` per minute. Failing models cool down and the chain moves on. A used-up daily quota sits out until midnight Pacific.
- **No lost data:** events carry a client uuid (a retried batch is stored once); failed batches retry with backoff (2 s to 60 s); wish saves and session creation retry; every call waits for the session cookie first; DB errors return 503 so the client retries.
- **Backups:** `npm run backup` (local) writes `backups/*.sql.gz`; public: see `docs/DEPLOY.md`.

## Accepted (not fixed, by choice)

- **Gemini free tier** for the study: Google may use prompts and responses, and people may review them. `/terms` says so. Check against the IRB protocol; use a paid tier in public.
- **In-memory state** (rate buckets, model health, the Gemini RPM queue) lives in one process. Correct for the single API worker; move to Postgres or Redis before running more.
- **Local stack has no proxy:** the API port is published, so IP limits key on the socket address (correct) and cookies and global limits still hold. LAN admin login over http is refused; open admin on the laptop (`localhost`) or set `ADMIN_ALLOW_HTTP=true` knowing the password crosses the Wi-Fi.
- **Prompt injection:** model output is schema-validated and rendered as text; the worst case is an off-topic move shown to the student who typed it.
- **Events sent on page close** (sendBeacon) can't be retried.
- **Personal data:** `participant_code` is a name and free text may contain personal details. Export, back up, then delete after the study.

## Before each session

1. `npm run llm:check -- "test wish" --all`: at least 2 models answer.
2. `ADMIN_PASSWORD` in `.env` is 8+ characters and not `change-me`.
3. `docker compose up -d --build` (local) or the public stack; open admin on the laptop or over https.
4. Dry run as `TEST <name>`, check admin, then delete it (preview first).
5. Afterwards: back up and export the CSVs.
