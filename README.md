# Wish Engine prototype

Laptop-first prototype for user-testing move options. See `docs/PROMPT.md` for the full brief and `CLAUDE.md` for working notes.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env`; set `DATABASE_URL` (local Postgres: `createdb -h 127.0.0.1 wish_engine`, then `postgres://<your-mac-username>@127.0.0.1:5432/wish_engine`; Neon/Supabase also work if you ever deploy), `ADMIN_PASSWORD`, and `GEMINI_API_KEY`.
3. `npm run db:push` to create tables, `npm run seed` to validate `data/*.json`.
4. `npm run dev` (or `npm run dev:lan` so other devices on your Wi-Fi can reach it).

## Docker (alternative to the setup above)
Needs Docker Desktop and a `.env` (API keys, `ADMIN_PASSWORD` of 8+ characters, `LAN_HOST` = this Mac's LAN IP, `FLOW_MOVES`, ...). `DATABASE_URL` in `.env` is ignored; Compose runs its own Postgres. Caddy is the only public entry: plain http for students, https (its own certificate; accept the browser warning once) for admin, which refuses logins over plain http from other machines.
```
docker compose up -d --build     # students: http://LAN_HOST:3010   admin: https://LAN_HOST:3443/admin
docker compose logs -f app       # server logs
docker compose down              # stop (data is kept in the pgdata volume)
docker compose down -v           # stop and delete all data
```
`PORT=3020 HTTPS_PORT=3444 docker compose up -d` picks other ports. `npm run backup` dumps the database to `backups/`. Tables are created on every start by the `migrate` service. After code changes, rebuild with `docker compose up -d --build`. Ollama on the Mac is reached at `host.docker.internal:11434`.

## Models (`MOVE_PROVIDER`)
- `auto` (default): every available model with automatic failover. Gemini models are discovered from the API (no model setting needed); Groq / OpenRouter join if `GROQ_API_KEY` / `OPENROUTER_API_KEY` is set; a local Ollama joins if it is running.
- `gemini` / `ollama`: only that service.

A model that errors or takes longer than `LLM_TIMEOUT_MS` is skipped for the next one and put on cooldown. If every model fails (or `LLM_BUDGET_MS` runs out), the student sees a "Try again" message and `options_failed` is logged; there are no fixed moves to substitute. Every request goes to the model (no cache), so students with the same wish get their own options. The admin page's Models panel shows each model's status and lets you choose which to try first.

`npm run llm:check -- "some wish" --all` prints the model chain, pings every model, and generates one sample set of moves.

## Running a test session
Each new session asks for a name on the first screen; that name is the participant label in all data. `?p=NAME` optionally prefills it. Names starting with `TEST` in capitals plus a space, dash or underscore (e.g. `TEST Waleed`, `TEST-3`) can be bulk-deleted from the admin moderator box after a preview; "Tester" does not match.

## Exporting data
`/admin` (password from `ADMIN_PASSWORD`) offers `events.csv`, `choices.csv`, `feedback.csv`, `moves.csv`; the same routes accept filters: `/api/admin/export/choices?provider=...&from=YYYY-MM-DD&to=YYYY-MM-DD`.

## Testing
- `npm test`: unit tests (engine, mocked LLM providers, analytics, CSV). No live model calls.
- `npm run llm:check`: one live call to the configured provider.
- End-to-end: with the dev server running, `BASE_URL=http://localhost:3000 npx tsx scripts/e2e.ts [--phone] [--shots=dir]` drives a full student session in headless Chrome (uses `TEST` participant codes; delete them from the admin moderator box afterwards).

## Notes
- Gemini model names get retired quickly; if `llm:check` shows a 404, list available models and update `GEMINI_MODEL`. Big "flash" models can return 503 under load; the app retries with backoff, and `options_failed` events record any request that still fails.
- Prompt version is logged on every options event; bump `PROMPT_VERSION` in `lib/prompts/` on any edit.
