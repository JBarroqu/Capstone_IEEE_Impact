# Wish Engine prototype

Laptop-first prototype for user-testing move options. See `docs/PROMPT.md` for the full brief and `CLAUDE.md` for working notes.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env`; set `DATABASE_URL` (local Postgres: `createdb -h 127.0.0.1 wish_engine`, then `postgres://<your-mac-username>@127.0.0.1:5432/wish_engine`; Neon/Supabase also work if you ever deploy), `ADMIN_PASSWORD`, and `GEMINI_API_KEY`.
3. `npm run db:push` to create tables, `npm run seed` to validate `data/*.json`.
4. `npm run dev` (or `npm run dev:lan` so other devices on your Wi-Fi can reach it).

## Providers (`MOVE_PROVIDER`)
- `gemini` (default): needs `GEMINI_API_KEY`; rate-limited in-memory (`GEMINI_RPM`, default 9/min).
- `ollama`: local model; set `OLLAMA_MODEL` to a 7-8B instruct model that supports JSON-schema output. Not reachable from Vercel.
- `static`: rule-based catalog only; use as the control condition. It is also the fallback when an LLM call fails or times out.

Run `npm run llm:check` to send one sample wish to the configured provider and print the 3 moves, latency, and validation result.

## Running a test session
Give each participant a link like `http://localhost:3000/?p=P08`. Codes starting with `TEST` can be bulk-deleted from the admin moderator box.

## Exporting data
`/admin` (password from `ADMIN_PASSWORD`) offers `events.csv`, `choices.csv`, `feedback.csv`, `moves.csv`; the same routes accept filters: `/api/admin/export/choices?provider=...&from=YYYY-MM-DD&to=YYYY-MM-DD`.

## Testing
- `npm test`: unit tests (engine, mocked LLM providers, analytics, CSV). No live model calls.
- `npm run llm:check`: one live call to the configured provider.
- End-to-end: with the dev server running, `BASE_URL=http://localhost:3000 npx tsx scripts/e2e.ts [--phone] [--shots=dir]` drives a full student session in headless Chrome (uses `TEST` participant codes; delete them from the admin moderator box afterwards).

## Notes
- Gemini model names get retired quickly; if `llm:check` shows a 404, list available models and update `GEMINI_MODEL`. Big "flash" models can return 503 under load; the app then falls back to `static` silently, and `provider_fallback` events record it.
- Prompt version is logged on every options event; bump `PROMPT_VERSION` in `lib/prompts/` on any edit.
