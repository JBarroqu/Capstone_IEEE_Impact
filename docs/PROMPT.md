# Build: Wish Engine — user-testing prototype

You're building a small, desktop-first (laptop) web prototype of the **Impact++ Wish Engine** so I can run user tests. **The first test group is senior ASU computer science majors** (final year: job search, new-grad offers, capstone, grad school applications, first real side projects). Every piece of content, every example, and every LLM prompt should be pitched at that audience: technically fluent, short on time, allergic to generic advice. This is not a production app. Its job is to (1) present students with move options for a wish, (2) record exactly which options they pick, skip, or reject, and (3) collect their feedback. Optimize for clean data and fast iteration, not scale.

Before writing code, read this whole brief, then give me a short plan (file tree, data model, event list) and wait for my OK.

---

## 1. What the Wish Engine is

Students have lots of ambitions ("wishes") and no first step. The engine takes any wish in the student's own words and returns an **ordered sequence of at least three concrete moves**:

- **Move 1**: small and quick, a fast first win.
- **Move 2**: builds on what move 1 showed.
- **Move 3**: the version the student actually ships.

At every step the student is shown **options** and picks one. If none fit, they say so and get a different set. Some moves are **paid** (e.g., being paired with a senior mentor); these are always optional and a free alternative is always offered alongside.

**Wish taxonomy** (used for matching moves and for analytics):

- **Type**: `open_ended` (e.g., "learn how ML works") or `fixed` (e.g., "achieve a 4.0 GPA").
- **Focus** (one or more): `learn`, `goal`, `system`, `advance`, `lead`, `connect`.
- **Domain**: `career` (Career & Industry), `academic` (Academic Foundation), `technical` (Technical Mastery), `venture` (Venture & Impact), `leadership` (Leadership & Network).
- Some wishes are **tiered** (Basic Python → Build an API → Enterprise backend). Out of scope for v1 beyond tagging moves with a `tier` field.

**Personalization inputs** the engine collects before showing moves:

- **Why** they want it (short free text, optional). Stored and shown back on the path summary.
- **Prior attempts**: "Have you already tried something for this that you didn't like?" (optional free text + quick chips like "online course", "YouTube", "a club", "nothing yet"). Moves tagged with a matching `format` are ranked lower.
- **Archetype**: a 3-question tap quiz that places the student in one archetype. Use four **placeholder** archetypes — `builder`, `connector`, `planner`, `explorer` — defined in one config file with a clear `// PLACEHOLDER — Waleed will replace` comment. Archetype only affects ranking, never hides options.

---

## 2. Stack

- **Next.js (App Router) + TypeScript + Tailwind CSS**, deployable to Vercel.
- **Postgres via Drizzle ORM**, connection from `DATABASE_URL` (works with Neon or Supabase free tier). Include `drizzle-kit` migrations and `npm run db:push`.
- **Options come from an LLM, behind a swappable `MoveProvider` interface** (full spec in Section 4b). Three providers, selected by `MOVE_PROVIDER` env var:
  - `gemini`: Google Gemini API via the official `@google/genai` SDK (`GEMINI_API_KEY`, `GEMINI_MODEL`, a Flash-class model). **Expected primary provider and the default**, whether run locally or deployed.
  - `ollama`: a local model on my laptop via Ollama (`OLLAMA_URL`, default `http://localhost:11434`; `OLLAMA_MODEL`). Optional; feasible since tests run from my laptop, and useful for offline sessions or keeping data on-device.
  - `static`: the deterministic rule-based engine from Section 4 over `data/moves.json`. Always built, used as the **fallback** when the LLM fails or times out, and selectable on its own as a control condition.
- No auth for students. Admin page protected by a password from `ADMIN_PASSWORD` (httpOnly cookie after login).
- Vitest for unit tests on the engine.
- README with setup, env vars, how to seed, how to run a test session, how to export data.

---

## 3. Student flow (screens)

Desktop/laptop-first (design at ~1280px wide, a centered content column of ~640–720px; tests will mostly run on my laptop). It should still degrade gracefully to a narrow phone width (390px), but that is not the design target. One idea per screen. Every screen has a small "Start over" link.

1. **Welcome + consent**
   - One paragraph: what this is, that it's a prototype, that choices and feedback are logged anonymously for research, and that they shouldn't type personal details (names, contact info) into text fields.
   - When `MOVE_PROVIDER=gemini`, add one plain sentence: what they type (wish, why, prior attempts) is sent to Google's Gemini service to generate options, and may be reviewed by Google. Pull this text from config so I can edit it. When `ollama` or `static`, say instead that nothing leaves the test machine except the anonymous log.
   - Checkbox "I understand" + Continue. No consent → no logging and no continue.
   - Asks for the participant's name (required) and stores it as the participant code on the session; `?p=` optionally prefills it. Names are not sent to any LLM. Update the consent copy accordingly: logs are saved under the name, not anonymous.

2. **Wish intake**
   - Free-text field: "What do you want to make happen?"
   - Below it, 5–8 starter chips from the example wishes (Section 5). Tapping a chip fills the field.
   - Continue.

3. **Classify (student confirms)**
   - The engine guesses **domain** and **focus** from keywords (Section 4) and shows them as pre-selected chips: "Sounds like: *Connect* · *Leadership & Network*. Right?"
   - Student can change the selection. Log both the guess and the final answer (this measures classifier accuracy).
   - Also ask type: "Is there a clear finish line?" Yes → `fixed`, Not really → `open_ended`.

4. **Why + prior attempts** (one screen, both optional, "Skip" allowed).

5. **Archetype quiz**: 3 questions, 2–4 tap answers each. No free text.

6. **Pick a move** (repeats for step 1, 2, 3, and optionally 4–5)
   - Header: the wish, and "Move N of 3" progress.
   - While options load from the LLM, show a plain skeleton of 3 cards (no spinner copy like "thinking…", no typing animation). Prefetch step N+1's first set right after step N is locked, so the wait mostly disappears.
   - Show **exactly 3 options** as tappable cards. Each card: title, one-line detail, time estimate, and a Free / Paid tag.
   - Actions:
     - Tap a card to select, then "Lock it in".
     - "None of these fit" → a small sheet asking why (chips: "too big", "too small", "not my style", "already done this", "don't want to pay", "other" + optional text) → then show 3 new options that exclude everything already shown for this step. After 2 rerolls with nothing picked, allow "Skip this step".
   - Micro-feedback under the options: "Were these options useful?" Yes / Meh / No (optional, one tap).
   - After move 3, offer: "Add another move" (up to 5) or "I'm done".

7. **Path summary**
   - The wish, their "why", and the ordered chosen moves.
   - Feedback block (keep it short, all tap-first):
     - "How useful is this path?" 1–5.
     - "Would you actually do move 1 this week?" Yes / Maybe / No.
     - For any paid move shown during the session: "Would you pay for [move]?" Yes / Maybe / No.
     - "Anything confusing or missing?" optional text.
   - Submit → thank-you screen with "Try another wish" (same session, new wish).

---

## 4. Engine logic

This section is the **`static` provider** and the shared rules every provider must obey. `data/moves.json` is also the **catalog** the LLM providers draw on as examples and fallback (Section 4b). All content lives in `data/moves.json` and `data/wishes.json` so I can edit it without touching code.

**Move schema**

```ts
type Move = {
  id: string;              // stable slug, e.g. "connect-peer-match"
  title: string;           // short, imperative, ≤ 60 chars
  detail: string;          // one sentence
  step: 1 | 2 | 3 | 4 | 5; // where in the sequence it fits
  focus: Focus[];
  domains: Domain[];
  minutes: number;         // rough time estimate
  cost: "free" | "paid";
  format: "solo" | "peer" | "group" | "mentor" | "course" | "project" | "event";
  archetypeFit: Partial<Record<Archetype, number>>; // 0–1
  tier?: number;
  requires?: string[];     // move ids that should come earlier, if any
};
```

**Classification** (`classifyWish(text)`): keyword map per domain and focus in `data/keywords.json`, return best guesses plus a confidence. Unknown → no preselection.

**Selecting options** (`getOptions(session, step)`):

1. Candidates = moves where `step` matches and `focus`/`domain` overlap the confirmed wish tags.
2. Exclude moves already shown at this step, already chosen, or rejected.
3. Score = focus overlap + domain overlap + archetype fit − penalty if `format` matches a prior attempt the student disliked + small bonus if `requires` are satisfied.
4. Return top 3, but guarantee **at least 2 free options** in every set, and at most 1 paid.
5. If fewer than 3 candidates remain, relax the domain filter, then the focus filter, and log `options_relaxed`.
6. Deterministic: same inputs → same outputs (tie-break by id). Add a seeded shuffle of position only if `SHUFFLE_POSITIONS=true`, and always log the position each option was shown in so position bias can be measured.

Unit-test: classification on the example wishes, the free/paid guarantee, exclusion after a reroll, relaxation, determinism.

---

## 4b. LLM move providers (`ollama`, `gemini`)

The LLM writes options tailored to the student's exact wish, why, prior attempts, and archetype, instead of only picking from a fixed list. The analytics in Section 6 still have to work, so every generated option must become a real, stored `Move` with a stable id.

**Interface.** Both providers implement the same `MoveProvider` as `static`:
`getOptions(session, step, { excludeIds, rejectReason, rerollIndex }) → { moves: Move[3], meta }`. Keep all model-specific code in `lib/providers/ollama.ts` and `lib/providers/gemini.ts`; the rest of the app never knows which one ran.

**Prompt** (`lib/prompts/moves.v1.ts`, versioned; bump the version on any edit and log it):

- System prompt: the audience is **senior ASU CS majors**; moves must be concrete, doable, and specific ("Ship a PR that fixes one `good first issue` in a repo you already use"), never vague ("Explore open source"). No invented ASU club names, real people, or prices (use `[PRICE]`). Explain the step semantics (move 1 = quick win under ~60 min; move 2 = builds on move 1; move 3 = the version they ship).
- Context: wish text, confirmed type/focus/domain, why, prior attempts (with "rank these formats lower"), archetype, the moves already locked in earlier steps (titles + details), and for a reroll the rejected options + the reason chip/text ("too big" → go smaller, "don't want to pay" → all free, etc.).
- Few-shot: include the 3 worked paths from Section 5 plus 6–10 catalog moves matching the wish's focus, so tone and granularity match the hand-written ones.
- Ask for **exactly 3 moves as JSON** matching the `Move` schema (minus `id`), at most 1 `paid`, at least 2 `free`. Use the provider's structured-output / JSON mode (Ollama `format` with a JSON schema; Gemini `responseMimeType: "application/json"` + `responseSchema`). Low temperature (~0.4).

**Validation and repair** (server-side, zod):

1. Parse; on failure, retry once with the validation error appended. Still failing → fall back to `static` for this set.
2. Enforce the free/paid rule in code, not just in the prompt: if the model returns 2+ paid, keep the best-scored paid one and backfill with catalog free moves.
3. Enforce length limits (title ≤ 60 chars, detail one sentence) by truncation, and reject any move whose title is a near-duplicate (normalized-text match) of something already shown at this step.
4. Timeout (`LLM_TIMEOUT_MS`, default 12000). On timeout or network error → `static` fallback, and the student never sees an error.

**Stable ids for analytics.** Store every generated move in a `generated_moves` table (`id`, `session_id`, `wish_id`, `step`, the full `Move` JSON, `provider`, `model`, `prompt_version`, `created_at`). Id = `gen-` + short hash of normalized title + step, so the same move generated twice shares an id and the leaderboard can aggregate it. Catalog moves keep their slugs. The leaderboard must show both kinds, with a `source` column (`catalog` / `generated`).

**Admin catalog promotion.** In `/admin`, a "Generated moves" table (sorted by pick rate) with a button to copy a move's JSON so I can paste the winners into `data/moves.json`. No write-back to the file from the app.

**Local vs. deployed.** Document in the README:

- Most tests run from my laptop (participants use my laptop, or reach it via the LAN URL with `next dev -H 0.0.0.0`). Default `MOVE_PROVIDER=gemini`; `ollama` is an optional local alternative. A Vercel deployment cannot reach Ollama on my laptop, so don't try.
- Remote/unmoderated tests, if any: deploy to Vercel with `MOVE_PROVIDER=gemini`.
- Suggested Ollama models: a 7–8B instruct model that supports JSON-schema output; include a `npm run llm:check` script that sends one sample wish to the configured provider and prints the 3 moves, latency, and whether validation passed. I'll use it to pick a model.
- Note the Gemini free tier's per-minute rate limits: add a simple in-memory queue so a burst of testers doesn't get 429s (fall back to `static` if the queue wait exceeds the timeout).

**Consistency.** LLM output varies, which makes comparisons across participants noisier. Mitigate: cache results keyed on (normalized wish, confirmed tags, archetype, step, excluded ids, prompt version) in Postgres, so identical inputs get identical options within a test run. `LLM_CACHE=false` disables it.

**Unit tests** (mock the model; no live calls in CI): valid JSON path, malformed JSON → retry → fallback, 2 paid → repaired, duplicate title filtered, timeout → fallback, id hashing is stable.

---

## 5. Seed content

Options are LLM-generated, so the catalog is deliberately small: it exists only as the `static` fallback/control, few-shot examples for the prompt, and stable-id analytics baseline. Write **`data/moves.json` with ~5 moves per focus (~30 total, plus the 3 worked paths below)**, spread across steps 1–3, realistic for **senior** ASU CS students: assume they already know how to code, have taken data structures/algorithms, and probably have a resume and a GitHub. Skip beginner moves ("learn what Git is") unless the wish is explicitly beginner-level. Lean on what seniors actually face: new-grad applications and referrals, technical interviews, the capstone project, grad school applications and recommendation letters, turning a class project into a portfolio piece, and first-job decisions. Keep titles concrete ("Message one alum who works in healthcare"), never vague ("Explore opportunities"). Don't invent specific ASU club names, people, or prices; use generic phrasing and put any price as `"[PRICE]"` in the detail.

Must include these worked paths from the proposal so testers see them:

- **Resume wish** ("An impressive resume"): build one from a gold-standard template → surface the gap (strong projects, no internships) → step-3 options: join clubs in the target field / compete in a hackathon.
- **DevOps wish** ("Learn DevOps"): choose a cloud lane (AWS, Azure, or GCP, each explained) → curated resources for that lane → build in a hands-on sandbox.
- **Connection wish** ("Connect in the healthcare industry"): matched with other students who share the wish → placed in a small group to compare notes → *paid, optional:* paired with a senior already working in the field.

Starter wishes for chips and `data/wishes.json` (lead the chips with the senior-relevant ones: new-grad SWE offer, pass technical interviews, turn my capstone into a portfolio piece, get into a CS master's/PhD program): SWE internship, FAANG offer, a resume that opens doors, 4.0 GPA, a top graduate program, how ML really works, LeetCode fluency, build an inference engine, a B2B SaaS, first open-source PR, something that helps people, healthcare connections, becoming an engineering manager, real influence online.

---

## 6. Analytics (the main point of this build)

### Event log

One append-only table `events`:

| column | type | notes |
|---|---|---|
| id | uuid | |
| created_at | timestamptz | server time |
| client_ts | timestamptz | client time |
| session_id | uuid | one per browser session |
| wish_id | uuid, nullable | one per wish within a session |
| participant_code | text | the name entered on the welcome screen |
| app_version | text | from package.json |
| provider | text | `static` / `ollama` / `gemini` (the provider actually used, after any fallback) |
| name | text | event name |
| step | int, nullable | move step when relevant |
| payload | jsonb | event-specific data |

Plus `sessions` and `wishes` tables for convenient joins (wish text, confirmed tags, archetype, why, prior attempts).

Client batches events and posts to `POST /api/events`; flush on navigation and with `navigator.sendBeacon` on `pagehide`. Never block the UI on logging. Validate payloads with zod on the server.

### Events to log (at minimum)

`session_started`, `consent_given`, `wish_submitted` (text, from_chip), `classification_guessed`, `classification_confirmed` (guess vs final, changed: bool), `why_submitted`, `prior_attempts_submitted`, `quiz_answered` (q, answer), `archetype_assigned`, `options_shown` (step, move ids **in display order**, reroll_index, relaxed: bool, source per move, requested_provider, used_provider, model, prompt_version, latency_ms, cache_hit, repaired: bool), `provider_fallback` (requested provider, reason: timeout / invalid_json / rate_limited / error), `option_selected` (move id, position, ms_since_shown), `option_deselected`, `move_locked` (move id, position, ms_since_shown, reroll_index), `options_rejected` (reason chip, text, move ids rejected), `step_skipped`, `options_feedback` (yes/meh/no), `path_completed` (ordered move ids), `path_rated`, `would_do_this_week`, `paid_willingness` (move id, answer), `open_feedback`, `start_over`, `session_abandoned` (last screen, on `pagehide` without completion).

### Admin page `/admin`

Password-gated. One page, plain tables, no charting library needed (a simple horizontal bar made of divs is fine). Filters at the top: date range, provider, participant code.

- **Funnel**: sessions → consented → wish submitted → move 1 locked → move 2 → move 3 → path rated.
- **Move leaderboard**: per move — times shown, times picked, **pick rate** (picked ÷ shown), times rejected, median decision time, pick rate by display position. Sortable. Grouped by step and focus.
- **Reject reasons**: counts per reason, per step.
- **Classifier accuracy**: % of wishes where the student kept the guessed focus/domain.
- **Feedback**: average path rating, "would do this week" split, paid willingness per paid move, options-useful split per step, and a list of open-text feedback with the wish it came from.
- **Provider comparison**: the same key numbers side by side per provider (static vs. ollama vs. gemini), plus median option latency, fallback rate, and "options useful" split. This is how I'll tell whether the LLM actually beats the hand-written catalog.
- **Generated moves** table (Section 4b).
- **CSV exports** (download buttons):
  - `events.csv` — raw events, payload flattened to JSON string.
  - `choices.csv` — one row per decision: session, participant, wish text, focus, domain, archetype, step, shown ids (in order), chosen id, chosen position, decision ms, reroll index, reject reason.
  - `feedback.csv` — one row per completed path with all feedback fields.
  - `moves.csv` — the leaderboard as shown.
- A "Moderator" box: generate a test link for a participant code (`/?p=P08`), and a button to delete sessions marked as test data (sessions with participant code starting `TEST`).

---

## 7. Visual design

There is **one design and no themes**. Follow the mockups in `/design` (`Chapter-Intake.dc.html`, `Chapter-Pick.dc.html`): Figtree, blue header band, pill chips, 14px-radius cards, dark pill primary button. Extend the same language to the other student screens and to `/admin`. Desktop-first: full-width header band with a centered content column.

Keep these rules:

- No gradients, glows, sparkle icons, chat bubbles, typing animations, "AI" or "smart" wording, or emoji.
- Copy says "moves" and "options", never "suggestions generated for you".
- Touch targets ≥ 44px, text contrast ≥ 4.5:1, real `<button>`/`<input>`/`<label>` elements, visible focus styles, works with keyboard.

Load fonts with `next/font/google`.

---

## 8. Done means

- [ ] `npm run dev` works with a local or Neon `DATABASE_URL`; `npm run db:push` and `npm run seed` work.
- [ ] A full session (consent → wish → classify → why → quiz → 3 moves with at least one reroll → summary feedback) completes on a laptop-sized viewport (and does not break at phone width).
- [ ] Every event in Section 6 appears in the `events` table with the right payload.
- [ ] `/admin` shows the funnel, move leaderboard with pick rates, reject reasons, feedback, and provider comparison, and all four CSV exports download and open cleanly in Excel/Sheets.
- [ ] Engine unit tests pass, including the mocked LLM provider tests.
- [ ] `npm run llm:check` returns 3 valid moves from both Ollama and Gemini, and killing Ollama mid-session falls back to `static` without the student noticing.
- [ ] Lighthouse accessibility ≥ 95 on the pick-a-move screen.
- [ ] README explains setup, running a moderated test with participant links, and exporting data.

Build in this order: data model + event logging → static engine + seed data + tests → Ollama and Gemini providers + validation + tests → student flow → admin page + exports → polish. Commit after each stage.
