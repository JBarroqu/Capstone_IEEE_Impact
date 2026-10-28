# Wish Engine prototype

Laptop-first prototype for user-testing move options. See `docs/PROMPT.md` for the full brief and `CLAUDE.md` for working notes.

Two processes: the **Next.js frontend** (pages only) and the **FastAPI backend** in `backend/` (every `/api` route, the model chain, prompts, analytics). The browser calls the API directly on the same host, port 8000 by default.

## Setup
1. `npm install`, then `npm run api:setup` (creates `backend/.venv` with Python 3.13 and installs `backend/requirements.txt`).
2. Copy `.env.example` to `.env`; set `DATABASE_URL` (local Postgres: `createdb -h 127.0.0.1 wish_engine`, then `postgres://<your-mac-username>@127.0.0.1:5432/wish_engine`; Neon/Supabase also work if you ever deploy), `ADMIN_PASSWORD`, and `GEMINI_API_KEY`. The API reads the same `.env`.
3. `npm run db:push` to create tables, `npm run seed` to validate `data/wishes.json`.
4. In two terminals: `npm run api` (FastAPI on :8000, API docs at http://localhost:8000/docs) and `npm run dev` (pages on :3000). For other devices on your Wi-Fi: `npm run api:lan` and `npm run dev:lan`.

## Docker (alternative to the setup above)
Needs Docker Desktop and a `.env` (API keys, `ADMIN_PASSWORD`, `FLOW_MOVES`, ...). `DATABASE_URL` in `.env` is ignored; Compose runs its own Postgres. Containers: `db`, `migrate` (creates tables, exits), `api` (FastAPI, one worker) and `app` (Next.js). Built for local and LAN test sessions only; see `docs/GOING-PUBLIC.md` before exposing it to the internet.
```
docker compose up -d --build     # app on http://localhost:3010, admin at /admin, API on :8000
docker compose logs -f api       # API logs (model calls, errors)
docker compose down              # stop (data is kept in the pgdata volume)
docker compose down -v           # stop and delete all data
```
`PORT=3020 API_PORT=8020 docker compose up -d --build` picks other ports (the API port is baked into the frontend build, hence `--build`). `npm run backup` dumps the database to `backups/`. Tables are created on every start by the `migrate` service. After code changes, rebuild with `docker compose up -d --build`. Ollama on the Mac is reached at `host.docker.internal:11434`.

## Models (`MOVE_PROVIDER`)
- `auto` (default): every available model with automatic failover. Gemini models are discovered from the API (no model setting needed); Groq / OpenRouter join if `GROQ_API_KEY` / `OPENROUTER_API_KEY` is set; a local Ollama joins if it is running.
- `gemini` / `ollama`: only that service.

A model that errors or takes longer than `LLM_TIMEOUT_MS` is skipped for the next one and put on cooldown. If every model fails (or `LLM_BUDGET_MS` runs out), the student sees a "Try again" message and `options_failed` is logged; there are no fixed moves to substitute. Every request goes to the model (no cache), so students with the same wish get their own options. The admin page's Models panel shows each model's status and lets you choose which to try first.

`npm run llm:check -- "some wish" --all` prints the model chain, pings every model, and generates one sample set of moves.

## Running a test session
Each new session asks for a name on the first screen; that name is the participant label in all data. `?p=NAME` optionally prefills it. Names starting with `TEST` in capitals plus a space, dash or underscore (e.g. `TEST Waleed`, `TEST-3`) can be bulk-deleted from the admin moderator box after a preview; "Tester" does not match.

## Exporting data
`/admin` (password from `ADMIN_PASSWORD`) offers `events.csv`, `choices.csv`, `feedback.csv`, `moves.csv`; the same API routes accept filters: `http://localhost:8000/api/admin/export/choices?provider=...&from=YYYY-MM-DD&to=YYYY-MM-DD`. `npm run export` writes the presentation export (`exports/results.csv` and `.md`).

## Testing
- `npm test`: frontend unit tests (vitest), then backend tests (`backend/tests`, pytest: mocked model chain, prompts, analytics, CSV). No live model calls.
- `npm run llm:check`: one live call to the configured provider.
- End-to-end: with the API and the dev server running, `BASE_URL=http://localhost:3000 npx tsx scripts/e2e.ts [--phone] [--shots=dir]` drives a full student session in headless Chrome (uses `TEST` participant codes; delete them from the admin moderator box afterwards).

## Notes
- Gemini model names get retired quickly; if `llm:check` shows a 404, the chain marks that model gone and moves on (pin models with `GEMINI_MODELS` if needed). Big "flash" models can return 503 under load; the chain skips them for a while, and `options_failed` events record any request that still fails.
- Prompt version is logged on every options event; bump `PROMPT_VERSION` in `backend/wish_api/prompts/` on any edit.
