# Security and reliability

What is in place, and the known gaps, roughly ordered by how likely they are to hurt a user-testing session. "Fix" lines are suggestions, not done unless marked.

## In place

- **Rate limiting** (`lib/rate-limit.ts`): in-memory token buckets, applied at the top of each API route. A refused request gets `429 {ok:false, reason:"rate_limited", retry_after_s}` and a `Retry-After` header. On `/api/options` the client already shows the retry screen and logs `options_failed{reason:"rate_limited"}`. Turn it off with `RATE_LIMIT=false` (load tests only).

  | Route | Per IP | Per session |
  |---|---|---|
  | `/api/options` (LLM) | 120/min | 20/min |
  | `/api/classify` (LLM) | 60/min | – (body has no sessionId) |
  | `/api/events` | 600/min | 60 batches/min |
  | `/api/wish` | 300/min | – |
  | `/api/session` | 30/min | – |
  | `/api/admin/login` | 10 per 15 min | – |
  | `/api/admin/models` (pings every model) | 6/min | – |

  The per-IP limits are loose on purpose: a lab of students on campus Wi-Fi can all share one NAT address. The per-session limits do most of the work.
- Upstream model quotas: `RateQueue` (`lib/providers/queue.ts`) caps each Gemini model at `GEMINI_RPM` (default 9/min). `Health` puts failing or 429ing models on cooldown so the chain skips them.
- Zod validation on every request body. Text fields are capped at 500–1000 characters.
- Admin password check uses `timingSafeEqual`. The cookie is httpOnly and `SameSite=Lax`, and `Secure` over HTTPS.
- React escapes all model output, so a generated move cannot inject HTML.

## Security gaps

### 1. Rate limits can be bypassed when the app is exposed directly
The IP comes from `X-Forwarded-For`, which a client can set itself unless a proxy in front overwrites it. Per-session limits can be dodged too, since the client picks its own `sessionId`. Someone with a script could still use up the Gemini quota.
**Fix:** put Caddy, nginx or a Cloudflare Tunnel in front, configured to overwrite `X-Forwarded-For` (this also gives HTTPS, see 3). Optionally, issue a signed session token from `/api/session` and have `/api/options` require it.

### 2. Anyone can write fake study data
`/api/session`, `/api/wish` and `/api/events` take any UUIDs and any `participantCode`, with no proof that a session came from the consent screen. Junk rows go straight into analytics. `/api/wish` will also update an existing wish for anyone who knows its id. The ids are random UUIDs, so this risk is small.
**Fix:** `/api/session` returns an HMAC-signed `{sessionId, iat}` cookie, and the write routes check that it matches the `sessionId` in the body. Before the analysis, filter out sessions that have no `consent_given` event.

### 3. Admin login over plain HTTP on the LAN
On `http://192.168.x.x:3010/admin` the password and the cookie travel in cleartext over shared Wi-Fi.
**Fix:** use HTTPS (a Caddy reverse proxy, or `cloudflared tunnel`), or open admin only on localhost.

### 4. The admin cookie never really expires
The token is `sha256("wish-admin:" + password)`. It is deterministic, has no server-side expiry, and is the same for every login. A copied cookie works until the password changes, and the 12h `maxAge` only tells the browser when to drop it.
**Fix:** use `HMAC(secret, issuedAt)` with an expiry checked on the server, and fail at startup if `ADMIN_PASSWORD` is empty or `change-me`.

### 5. Unbounded arrays on `/api/options` blow up prompt size
`excludeIds`, `ctx.chosen`, `rejectedMoves` and the move fields (`title`, `detail`, `requires`) have no `.max()`. One request inside the rate limit can still send a huge prompt, which costs tokens and time on every model in the chain. `/api/events` has a similar problem: `payload` is `z.record(unknown)` with no size cap, so 100 events can carry a lot of JSON into Postgres.
**Fix:** add `.max()` to those arrays and strings, and reject bodies over about 64 KB (check `content-length`, or read `req.text()` and measure it).

### 6. CSV formula injection in admin exports
`lib/csv.ts` quotes commas and quotes, but it leaves cells that start with `=`, `+`, `-` or `@` alone. A student who types `=HYPERLINK(...)` into open feedback gets a live formula when the researcher opens the export in Excel.
**Fix:** prefix those cells with `'` in `esc()`.

### 7. "Delete test data" can match real participants
`ilike(participant_code, 'TEST%')` also matches real codes like "Tester", "Testa" and "testudo". Deletion is permanent.
**Fix:** match an exact prefix like `TEST-` (case-sensitive), and show the count and the codes before deleting.

### 8. Prompt injection
The wish, why and prior-attempts text go straight into the prompt. The output is schema-validated and rendered as text, so the realistic harm is off-topic or inappropriate moves. Because `llm_cache` is keyed on the normalized wish text plus context, a bad response is cached and shown again only to someone who sends the same input.
**Fix:** this is acceptable for the prototype. The admin Moderator panel is the backstop. If needed, add a delete-cache-entry action there.

### 9. No security headers
There is no CSP, `X-Frame-Options` or `Referrer-Policy`.
**Fix:** add `headers()` in `next.config.mjs` with `frame-ancestors 'none'`, `nosniff` and `Referrer-Policy: same-origin`.

### 10. Hard-coded Docker DB credentials
`wish/wish` in `docker-compose.yml`. Postgres is not published to the host, so it is reachable only inside the compose network. That is fine as long as nobody adds a `ports:` entry.

## Privacy and study ethics

- **Gemini free tier data use:** Google's terms for the unpaid Gemini API let Google use prompts and responses to improve its products, and human reviewers may read them. Students' wishes and "why" answers fall under this. The consent copy says the text "may be reviewed by that service", which matches. Check that this is acceptable for the IRB protocol. A paid (billing-enabled) key is not used for training.
- `participant_code` is a real name and is stored in plain text in every events row. Export, then delete, after the study. Don't commit `exports/` (already git-ignored).
- Free text may contain PII even though the consent copy asks students not to type any.

## Reliability gaps

### 11. Model capacity during a group session
With `GEMINI_RPM=9` per model, and about 2 to 4 option calls plus 1 classify call per student, a room of 30 students starting at the same time will queue. Each request waits up to `LLM_BUDGET_MS` (60s) before showing a retry. Per-minute limits also do nothing about the free tier's **daily** request caps, which can run out partway through a day of sessions.
**Fix:** before a session, run `npm run llm:check -- --all`, add Groq/OpenRouter keys as backup, stagger start times, or enable billing for the session day. Watch the admin Models panel.

### 12. Events are fire-and-forget
`lib/track.ts` empties its queue before sending. A failed POST, a 500 from a Postgres hiccup or a 429 loses those events for good. `saveWish` swallows errors the same way.
**Fix:** put failed batches back in the queue, with a cap and backoff, and keep unsent events in `localStorage` until the server acknowledges them.

### 13. In-memory state is per process
The rate-limit buckets, model health/cooldowns and `RateQueue` slots reset on restart, and multiple replicas would not share them. This is fine for one container. Move them to Postgres or Redis before scaling out.

### 14. Database
- No backups of the `pgdata` volume. Run `pg_dump` (or the export script) after each session.
- Pool `max: 5` (`lib/db/client.ts`) is fine for one process. Many concurrent event inserts will queue but not fail.
- `/api/session` and `/api/wish` have no try/catch. A DB outage returns a bare 500, and the client ignores it (see 12).
- No foreign keys between `wishes`, `events` and `sessions`, so orphan rows are possible (see 2).

### 15. Model churn
Gemini models get retired or overloaded often (see CLAUDE.md gotchas). Discovery plus `Health` handles this automatically. The remaining risk is that every model is down at once, and then students see the retry screen, as intended.

## Before each session

1. `npm run llm:check -- "test wish" --all` and check that at least 2 models respond.
2. `ADMIN_PASSWORD` is not the default. Use HTTPS if admin will be opened over the LAN.
3. `RATE_LIMIT` is not `false`.
4. Run one participant through with a `TEST-` code, check the admin page, then delete the test data.
5. Back up or export afterwards.
