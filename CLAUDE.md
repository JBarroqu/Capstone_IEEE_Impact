# Wish Engine prototype

Planned work (generated follow-up questions, etc.) lives in `docs/NEXT.md`.

User-testing prototype: shows students 3 move options per step for a "wish", logs every pick/skip/reject, collects feedback. Source of truth for requirements: `docs/PROMPT.md` (note its UPDATE notes: laptop-first, Gemini default, single design in /design, no themes).

## Rules
- **No `Co-Authored-By` / "Generated with Claude Code" lines** in commits or PRs. Plain messages. Commit after each stage. Never push without being asked (remote: waleedalfar/iihow).
- **Static moves are a failure, not a fallback**: the point is LLM-generated moves. Never silently serve catalog moves when the LLM fails; show a retry and log `options_failed`. `static` is only a deliberate control provider.
- **Design**: follow `design/*.dc.html` mockups (Figtree, blue band header, pill chips). Only one visual design; there are no themes. Admin page reuses the same design.
- Content is pitched at senior ASU CS majors. No emoji, no "AI"/"smart" wording, say "moves"/"options".

## Commands
`npm run dev` · `npm test` (vitest, no live LLM calls) · `npm run typecheck` · `npm run db:push` · `npm run seed` (validates data/*.json) · `npm run llm:check [wish]` · `npx tsx scripts/e2e.ts` (browser smoke test, needs dev server + Chrome)

## Layout
- `data/` moves.json (catalog, generated from a compact script, edit JSON directly), wishes.json, keywords.json
- `lib/engine/` classify + static selector (deterministic; ≥2 free, ≤1 paid; relaxes domain → focus → step)
- `lib/providers/` `getOptions` (index.ts: provider + Postgres cache + generated_moves persistence) → `llm.ts` `chainProvider`/`runChain` → `run.ts` walks the model chain: `backends.ts` discovers models (Gemini via ListModels API, ranked lite > flash > pro; Groq/OpenRouter if keyed; local Ollama if running), `health.ts` puts failing models on cooldown so the next request skips them, admin "Try first" choice in `prefs.ts` (settings table). Throws `LlmUnavailable` when every model fails or LLM_BUDGET_MS runs out; NO static substitution unless LLM_FALLBACK=static. Prompts: `lib/prompts/moves.v2.ts` (bump `PROMPT_VERSION`), `classify.v1.ts` (bump `CLASSIFY_VERSION`)
- Wish classification: `/api/classify` runs the same chain in the background after the wish is submitted (no student-facing screen); move requests wait for it. Keyword classifier answers only if every model fails (`source: "keywords"`).
- `lib/analytics.ts` pure stat/CSV-row functions over event rows; `lib/admin-data.ts` loads from DB; API under `app/api/`
- `lib/track.ts` client event batching (needs `setConsent(true)` first; flushes with sendBeacon on pagehide)

## Gotchas
- Event payload keys are snake_case and analytics depends on them: `options_shown{move_ids,reroll_index,relaxed,sources,requested_provider,used_provider,model,prompt_version,latency_ms,cache_hit,repaired,tried}`, `classification_guessed{focus,domains,type,source,provider,model,prompt_version,latency_ms,tried|fail_reason}`, `move_locked{move_id,position,ms_since_shown,reroll_index}`, `options_rejected{reason_chip,text,move_ids}`, `path_rated{rating}`, `would_do_this_week{answer}`, `paid_willingness{move_id,answer}`, `open_feedback{text}`, `path_completed{move_ids}`.
- Zod 4: use `z.partialRecord` for enum-keyed optional maps (`z.record` demands all keys).
- Generated move ids are `gen-` + hash(normalized title + step); catalog ids are slugs.
- Env vars: see `.env.example`. `MOVE_PROVIDER` defaults to `auto` (all available models). No model env var is needed; models are discovered. `npm run llm:check -- "wish" --all` pings every model in the chain.
- `FLOW_MOVES=1` (default): pick move 1, then straight to the rating screen (quick survey); `FLOW_MOVES=3` restores the full path.
- Student flow lives in `components/Flow.tsx` (state machine) with screens in `screens.tsx`, `Pick.tsx`, `Summary.tsx`; admin is `app/admin/page.tsx` (server component) + `components/admin/client.tsx`.
- `/api/wish` is an upsert on purpose: client updates for one wish arrive out of order.
- Gemini models get retired or overloaded often; `gemini-3.1-flash-lite` was reliable on 2026-09-28 but returned 503 on 2026-10-15, when `gemini-3.5-flash-lite` worked (~2s). Test with `GEMINI_MODEL=... npm run llm:check`; in zsh write `${m}:generateContent`, not `$m:generateContent`, in curl loops.
- Database: local Postgres 15 (brew service), db `wish_engine`; `DATABASE_URL` in `.env`. Tests never need it; e2e and the app do.
- `crypto.randomUUID` is undefined on plain-http LAN URLs (only HTTPS/localhost); always use `uuid()` from `lib/uuid.ts` in client code. Same for `navigator.clipboard`.
