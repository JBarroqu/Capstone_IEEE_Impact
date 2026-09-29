# Wish Engine prototype

Laptop-first prototype for user-testing move options. See `docs/PROMPT.md` for the full brief and `CLAUDE.md` for working notes.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env`; set `DATABASE_URL` (Neon or Supabase free tier), `ADMIN_PASSWORD`, and `GEMINI_API_KEY`.
3. `npm run db:push` to create tables, `npm run seed` to validate `data/*.json`.
4. `npm run dev` (or `npm run dev:lan` so other devices on your Wi-Fi can reach it).

## Providers (`MOVE_PROVIDER`)
- `gemini` (default): needs `GEMINI_API_KEY`; rate-limited in-memory (`GEMINI_RPM`, default 9/min).
- `ollama`: local model; set `OLLAMA_MODEL` to a 7-8B instruct model that supports JSON-schema output. Not reachable from Vercel.
- `static`: rule-based catalog only; use as the control condition. It is also the fallback when an LLM call fails or times out.

Run `npm run llm:check` to send one sample wish to the configured provider and print the 3 moves, latency, and validation result.

## Running a test session
Give each participant a link like `http://localhost:3000/?p=P08` (theme override: `&theme=...`). Codes starting with `TEST` can be bulk-deleted from the admin moderator box.

## Exporting data
`/admin` (password from `ADMIN_PASSWORD`) offers `events.csv`, `choices.csv`, `feedback.csv`, `moves.csv`; the same routes accept filters: `/api/admin/export/choices?theme=...&provider=...&from=YYYY-MM-DD&to=YYYY-MM-DD`.

## Status
Done: data model, event API, static engine, Gemini/Ollama providers, analytics and CSV functions, API routes, tests. Pending: student flow and admin page UI (waiting on mockups).
