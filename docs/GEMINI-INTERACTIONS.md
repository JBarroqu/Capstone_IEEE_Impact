# Gemini Interactions API: can Gemini hold a conversation?

Researched 2026-10-26 for the generated follow-up questions plan (`docs/NEXT.md`).

## Short answer

Yes. There are two ways:

1. **Stateless (what this app uses now).** `models.generateContent` keeps nothing between calls. To hold a conversation you send the whole history as `contents` (turns with `role: "user" | "model"`) on every call. The SDK's `ai.chats.create()` is only a wrapper that does this for you.
2. **Stateful: the Interactions API.** Every call returns an `id`. The next call passes `previous_interaction_id`, and Google rebuilds the history on its side, so you send only the new turn.

## Interactions API facts

- **Status:** generally available since June 2026. Google calls it "the recommended API" and says new models and features launch there first. `generateContent` is now "legacy" but still fully supported.
- **SDK:** `client.interactions.create()` in `@google/genai` 2.3.0 and later. This repo has 2.24.0, so nothing needs installing.
- **Free tier:** works. Tested 2026-10-26 with this project's free key on `gemini-3.5-flash-lite`: two chained turns took about 1.4 s and 1.7 s, and the JSON schema output parsed cleanly.
- **Storage:** `store` defaults to `true`. Free tier keeps interactions for **1 day**. Paid tier keeps them 55 days by default, or 7/14/28 if configured in AI Studio. `store: false` turns storage off but also disables `previous_interaction_id`. Stored interactions can be deleted by id.
- **Carried over between turns:** only the inputs and outputs. `system_instruction`, `tools` and generation config (`temperature`, thinking level) **must be sent again on every call**.
- **Structured output:** `response_format: { type: "text", mime_type: "application/json", schema }`. Read the result from `interaction.output_text`. This replaces `responseMimeType` / `responseJsonSchema` in `generateContent`.
- **Caching:** chained turns benefit from implicit caching of the history. Explicit context caching and the Batch API are not available on Interactions yet.
- **Models:** all current text models, including `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.6-flash`, `gemini-3.8-flash`, the 2.5 family and Gemma 4.

```js
const turn1 = await client.interactions.create({
  model: "gemini-3.5-flash-lite",
  system_instruction: SYSTEM,
  input: "Wish: Land a new-grad SWE offer. Why: graduating in May.",
  response_format: { type: "text", mime_type: "application/json", schema },
});
const turn2 = await client.interactions.create({
  model: "gemini-3.5-flash-lite",
  system_instruction: SYSTEM,            // not inherited
  previous_interaction_id: turn1.id,     // history comes from Google's side
  input: "They picked option 2. Ask the next question.",
  response_format: { type: "text", mime_type: "application/json", schema },
});
JSON.parse(turn2.output_text);
```

## What it means for this app

**Recommendation: keep building each prompt from `WishContext` (stateless) for the follow-up questions, and don't adopt `previous_interaction_id` yet.** Reasons:

- **Failover breaks the chain.** `runChain` moves to the next model when one is rate-limited or down: another Gemini model, Groq, OpenRouter or Ollama. An interaction id only works on Gemini. The non-Gemini backends would need the full history anyway, so we need the stateless path regardless.
- **Free-tier retention is 1 day.** That's enough within one session, but nothing carries over to a later visit.
- **The prompts are small.** About 1 to 2K tokens, so resending the context costs almost nothing, and on the free tier tokens aren't billed anyway.
- **Our cache and repro depend on it.** `llm_cache` keys on the full request, and each generated move records its `prompt_version` and inputs. With server-side history the inputs that produced a result would live partly on Google's servers.
- **Privacy:** with `store: true`, students' text sits in Google's interaction store for a day on top of normal API processing. Our current calls don't create that stored record. If we adopt it, mention it in the consent text.

**When to switch:** if the flow turns into a real back-and-forth chat (many turns, long history), or when a new model we need ships only on Interactions. In that case, add an `interactions` path in `lib/providers/gemini.ts` behind the same `Backend.generate` interface. It would chain only while the same Gemini model keeps answering, and fall back to sending the full history when the chain moves to another model.

**Worth doing regardless:** Google says new features land on Interactions first, so moving the Gemini backend from `generateContent` to `interactions.create` (stateless, `store: false`) is a low-risk way to keep up. Only the request and response shapes change: `input` / `response_format` / `output_text`.

## Sources
- [Interactions API overview](https://ai.google.dev/gemini-api/docs/interactions-overview)
- [Interactions API guide](https://ai.google.dev/gemini-api/docs/interactions)
- [Structured output (Interactions)](https://ai.google.dev/gemini-api/docs/structured-output?api=interactions)
- [TanStack AI Gemini adapter notes](https://tanstack.com/ai/v0/docs/adapters/gemini)
