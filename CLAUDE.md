# Wish Engine prototype

User-testing prototype: shows students 3 move options per step for a "wish", logs every pick/skip/reject, collects feedback. Source of truth for requirements: `docs/PROMPT.md` (note its UPDATE notes: laptop-first, Gemini default, single design in /design, no themes).

## Rules
- **No `Co-Authored-By` / "Generated with Claude Code" lines** in commits or PRs. Plain messages. Commit after each stage. Never push without being asked (remote: waleedalfar/IEEE).
- **Design**: follow `design/*.dc.html` mockups (Figtree, blue band header, pill chips). Only one visual design; there are no themes. Admin page reuses the same design.
- Content is pitched at senior ASU CS majors. No emoji, no "AI"/"smart" wording, say "moves"/"options".

## Commands
`npm run dev` · `npm test` (vitest, no live LLM calls) · `npm run typecheck` · `npm run db:push` · `npm run seed` (validates data/*.json) · `npm run llm:check [wish]` · `npx tsx scripts/e2e.ts` (browser smoke test, needs dev server + Chrome)

## Layout
- `data/` moves.json (catalog, generated from a compact script, edit JSON directly), wishes.json, keywords.json
- `lib/engine/` classify + static selector (deterministic; ≥2 free, ≤1 paid; relaxes domain → focus → step)
- `lib/providers/` `getOptions` (index.ts: provider + Postgres cache + generated_moves persistence) → `llm.ts` (retry once, repair, timeout, static fallback) → `gemini.ts` / `ollama.ts`; prompt in `lib/prompts/moves.v2.ts` (bump `PROMPT_VERSION` on any edit)
- `lib/analytics.ts` pure stat/CSV-row functions over event rows; `lib/admin-data.ts` loads from DB; API under `app/api/`
- `lib/track.ts` client event batching (needs `setConsent(true)` first; flushes with sendBeacon on pagehide)

## Gotchas
- Event payload keys are snake_case and analytics depends on them: `options_shown{move_ids,reroll_index,relaxed,sources,requested_provider,used_provider,model,prompt_version,latency_ms,cache_hit,repaired}`, `move_locked{move_id,position,ms_since_shown,reroll_index}`, `options_rejected{reason_chip,text,move_ids}`, `classification_confirmed{changed}`, `path_rated{rating}`, `would_do_this_week{answer}`, `paid_willingness{move_id,answer}`, `open_feedback{text}`, `path_completed{move_ids}`.
- Zod 4: use `z.partialRecord` for enum-keyed optional maps (`z.record` demands all keys).
- Generated move ids are `gen-` + hash(normalized title + step); catalog ids are slugs.
- Env vars: see `.env.example`. `MOVE_PROVIDER` defaults to `gemini` and silently uses `static` if `GEMINI_API_KEY` is empty.
- Student flow lives in `components/Flow.tsx` (state machine) with screens in `screens.tsx`, `Pick.tsx`, `Summary.tsx`; admin is `app/admin/page.tsx` (server component) + `components/admin/client.tsx`.
- `/api/wish` is an upsert on purpose: client updates for one wish arrive out of order.
- Gemini models get retired often; `gemini-3.1-flash-lite` was the reliable one on 2026-09-28 (bigger flash models returned 503).
- Database: local Postgres 15 (brew service), db `wish_engine`; `DATABASE_URL` in `.env`. Tests never need it; e2e and the app do.
