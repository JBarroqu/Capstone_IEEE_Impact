# Security and reliability (local use)

The prototype runs on the researcher's laptop. Participants use that laptop, or reach it over the LAN during a moderated session. It is not built for the open internet: the public-facing layer (rate limits, signed session cookie, https proxy, signed admin cookie, body caps, security headers) was removed and is kept at git tag `public-hardening`. **Read `docs/GOING-PUBLIC.md` before exposing the app to anyone outside the room.**

## What is in place

- **Admin password** (`ADMIN_PASSWORD`) on `/admin` and its API routes. httpOnly cookie, compared in constant time.
- **Validation:** zod on every request body, with `.max()` on arrays and strings, so a client bug can't send a huge prompt.
- **CSV exports** prefix text cells starting with `= + - @` (or tab/CR) with `'`, so student text can't run as a spreadsheet formula. Numbers are untouched.
- **Delete TEST sessions** only matches `^TEST[ _-]` (case-sensitive; "Tester" is safe). It shows the count and the codes first, refuses if the list changed, and runs in a transaction.
- **Model reliability:** each Gemini model is held to `GEMINI_RPM` per minute. Failing models cool down and the chain moves on. A used-up **daily** quota sits out until midnight Pacific, when it resets.
- **No lost data:**
  - Events carry a client uuid, so a retried batch is stored once.
  - A failed batch is retried with backoff (2 s to 60 s).
  - Wish saves and session creation retry.
  - The session and wish routes return 503 on DB errors, so the client retries.
- **Backups:** `npm run backup` writes `backups/*.sql.gz` from the compose DB or local Postgres.

## Worth knowing

- **LAN sessions:** the admin password crosses the Wi-Fi in cleartext on `http://192.168.x.x:3010/admin`. Open admin on the laptop itself (`localhost`) during sessions.
- **Gemini free tier** (kept on purpose): Google may use prompts and responses to improve its products, and people may review them. `/terms` says the text "may be reviewed by that service". Check this against the IRB protocol. Daily caps apply; the failover and the Groq/OpenRouter/Ollama backups soften them.
- **Prompt injection:** model output is schema-validated and rendered as text. The worst case is an off-topic move shown to the student who typed it (no cache, so it is never replayed to anyone else).
- **Personal data:** `participant_code` is a name, and free text may contain personal details. Export and back up, then delete after the study.
- **Events sent on page close** (sendBeacon) can't be retried; the browser gives no result.

## Before each session

1. `npm run llm:check -- "test wish" --all`: at least 2 models answer.
2. `docker compose up -d --build` (or `npm run dev`); open admin on the laptop.
3. Do a dry run as `TEST <name>`, check admin, then delete it (preview first).
4. Afterwards: `npm run backup`, and export the CSVs.
