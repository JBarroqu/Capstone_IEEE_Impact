# Security and reliability

What protects the app, and what is left. Last reviewed 2026-10-26. The Gemini free tier is kept on purpose; its limits are listed under "Accepted".

## How a request is checked

1. **Caddy** (docker compose) is the only thing that can reach the app. It replaces any `X-Forwarded-For` the client sent with the real address. Students use `http://HOST:3010`, admin uses `https://HOST:3443` (Caddy's own certificate, accept the warning once). Set `LAN_HOST` in `.env` to the Mac's LAN IP.
2. **Rate limits** (`lib/rate-limit.ts`): token buckets per IP, per session and globally. An over-limit request gets `429 {reason:"rate_limited", retry_after_s}` plus `Retry-After`.
3. **Body size cap** (`lib/request.ts` `readJson`): 1–64 KB depending on the route, checked before parsing. All arrays and strings in the Zod schemas have a `.max()`.
4. **Signed session cookie** (`lib/session-auth.ts`): `/api/session` (after consent) sets `wish_sess = sessionId.issuedAt.HMAC`. `/api/options`, `/api/classify`, `/api/wish` and `/api/events` refuse requests without it (401), and refuse a body `sessionId` that doesn't match it. A wish can only be updated by the session that created it.
5. **Signing key** (`lib/secret.ts`): `SESSION_SECRET`, or a random key created once and kept in the `settings` table, so cookies survive restarts.

| Route | Per IP | Per session | Global |
|---|---|---|---|
| `/api/options` (models) | 120/min | 20/min | 300/min |
| `/api/classify` (models) | 60/min | shares the 20/min | 200/min |
| `/api/events` | 600/min | 60 batches/min | – |
| `/api/wish` | 300/min | cookie required | – |
| `/api/session` | 30/min | – | 120/min |
| `/api/admin/login` | 10 per 15 min | – | – |
| `/api/admin/models` | 6/min | – | – |

Per-IP limits are loose because a lab can share one campus NAT address. The global limits still hold if someone fakes IPs (for example on `npm run dev:lan`, where there is no Caddy).

## Fixed (2026-10-26)

| # | Issue | Fix |
|---|---|---|
| 1 | IP limits bypassable by faking `X-Forwarded-For`. Next passes the client's header through, as tested. | Caddy in front, app port no longer published. Global limits, and per-session limits keyed on the signed cookie. |
| 2 | Anyone could write sessions, wishes and events | Signed session cookie required. `/api/session` requires `consented: true` and a non-empty name. Wish updates go through `setWhere` on the owning session. |
| 3 | Admin password in cleartext over LAN http | Admin login refused over plain http from a non-local address (403) unless `ADMIN_ALLOW_HTTP=true`. Use `https://HOST:3443`. |
| 4 | Admin cookie never expired and was a hash of the password | `HMAC(secret, admin + password fingerprint + issuedAt)`, expiring on the server after 12 h. Changing the password signs everyone out. `SameSite=Strict`. Login refused (503) while `ADMIN_PASSWORD` is empty, `change-me` or under 8 characters. |
| 5 | Unbounded arrays and strings in the prompt, unbounded event payloads | `.max()` on every array and string. Body caps of 1 KB (login, session), 4 KB (classify), 8 KB (wish), 32 KB (options), 64 KB (events). |
| 6 | CSV formula injection | Text cells starting with `= + - @`, tab or CR get a leading `'`. Numbers are untouched. |
| 7 | "Delete TEST" matched "Tester" etc. | Case-sensitive `^TEST[ _-]`. Two steps: the admin sees the count and the codes, then confirms. The delete is refused if the count changed in between, and runs in a transaction. |
| 8 | Bad cached move sets replayed | The cache was removed (moves.v3): every request is generated fresh, so a bad set is never shown to anyone else. |
| 9 | No security headers | CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`. No `X-Powered-By`. No HSTS, on purpose: students use http on 3010. |
| 10 | Hard-coded DB password | `POSTGRES_PASSWORD` from `.env` (default `wish`). It only applies when the `pgdata` volume is first created. |
| 11 | Free-tier daily quota retried every 30 s | A 429 naming a per-day quota puts that model on cooldown until midnight Pacific, when the quota resets. The chain moves on to the other models. |
| 12 | Events and wish saves lost on any error | Events get a client uuid, and the server ignores duplicates. A failed batch goes back on the queue and retries with backoff (2 s to 60 s, newest 1000 kept). Wish saves retry 4 times. Every call waits for the session cookie first. |
| 14 | No backups. Bare 500s on DB errors. | `npm run backup` writes `backups/*.sql.gz` (git-ignored) from the compose DB or local Postgres. The session and wish routes return 503 `reason:"db"`, and the client retries. |

The front page no longer shows the consent text. It sits at `/terms`, linked from "By continuing you agree to the study terms" under the Get started button. Clicking Get started is logged as `consent_given`, as before.

## Accepted (not fixed, by choice)

- **Gemini free tier.** Google may use free-tier prompts and responses to improve its products, and humans may review them. `/terms` says the text "may be reviewed by that service". Check this against the IRB protocol. Daily caps still apply. Mitigations: model failover, the daily cooldown (11), and the Groq/OpenRouter/Ollama backups.
- **In-memory state** (rate buckets, model health, the Gemini RPM queue) lives in one process and resets on restart. This is correct for the single container we run. Move it to Postgres or Redis before running more than one replica.
- **Prompt injection.** Model output is schema-validated and rendered as text, so the worst case is an off-topic move shown to the student who typed the input.
- **No foreign keys** between `sessions`, `wishes` and `events`. With the session cookie (2) no new orphans can be written, and adding foreign keys would fight the out-of-order wish upserts.
- **`npm run dev:lan` has no proxy**, so IP limits there can be dodged by faking the header. Cookie and global limits still apply. Use docker compose for real sessions.
- **Events sent by beacon on page close** are not retried. The browser gives no result to retry on.
- **Free text may contain PII**, and `participant_code` is a name. Export, back up, then delete after the study.

## Before each session

1. `npm run llm:check -- "test wish" --all`: at least 2 models answer.
2. `.env` has `ADMIN_PASSWORD` (8+ characters, not `change-me`) and `LAN_HOST` set to this Mac's LAN IP.
3. `docker compose up -d --build`. Students open `http://LAN_HOST:3010`, the researcher opens `https://LAN_HOST:3443/admin`.
4. Do a dry run with a `TEST <name>` participant, check admin, then delete it (preview first).
5. Afterwards: `npm run backup`, and export the CSVs.
