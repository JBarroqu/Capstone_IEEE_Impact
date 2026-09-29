import type { Move, OptionsRequest, OptionsResult, MoveProvider } from "../types";
import { buildPrompt, PROMPT_VERSION } from "../prompts/moves.v2";
import { parseModelJson, repairMoves, ValidationError } from "./validate";
import { staticGetOptions, normalizeTitle } from "../engine/select";
import { catalogById } from "../engine/catalog";
import { QueueTimeout } from "./queue";
import { config } from "../config";

export type Generate = (prompt: { system: string; user: string }, signal: AbortSignal) => Promise<string>;

export class RateLimited extends Error {}
export class Timeout extends Error {}

export type FailReason = NonNullable<OptionsResult["meta"]["fallbackReason"]>;

/** The LLM could not produce valid options after all attempts. Static moves are NOT substituted unless LLM_FALLBACK=static. */
export class LlmUnavailable extends Error {
  constructor(public reason: FailReason, public detail?: string) {
    super(`LLM unavailable (${reason})${detail ? `: ${detail}` : ""}`);
  }
}

export type LlmOptions = {
  /** Total tries per request; each try gets its own timeout. */
  attempts: number;
  /** Base backoff between tries (multiplied by try number; rate limits wait 5x). */
  backoffMs: number;
  /** "static" substitutes catalog moves when every attempt fails. Default "none": fail loudly instead. */
  fallback: "none" | "static";
};

/** Production settings from env. */
export const llmOpts: Partial<LlmOptions> = { attempts: config.llmAttempts, fallback: config.llmFallback };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function makeLlmProvider(
  name: "ollama" | "gemini",
  model: string,
  generate: Generate,
  timeoutMs: number,
  before?: (maxWaitMs: number) => Promise<void>,
  opts: Partial<LlmOptions> = {},
): MoveProvider {
  const { attempts = 3, backoffMs = 1000, fallback: fallbackMode = "none" } = opts;
  return {
    name,
    async getOptions(req: OptionsRequest): Promise<OptionsResult> {
      const t0 = Date.now();
      const base = { requestedProvider: name, model, promptVersion: PROMPT_VERSION };
      let lastError: string | undefined;
      let lastReason: FailReason = "error";
      let hint: string | undefined;

      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          // Waiting in the rate queue is fine; give it a generous budget rather than failing.
          await before?.(timeoutMs * attempts);
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), timeoutMs);
          let text: string;
          try {
            text = await generate(buildPrompt(req, hint), ctrl.signal);
          } finally {
            clearTimeout(timer);
          }
          const raws = parseModelJson(text);
          return assemble(req, raws, { ...base, latencyMs: Date.now() - t0 }, attempt > 0);
        } catch (e) {
          lastError = String((e as Error)?.message ?? e).slice(0, 300);
          let wait = backoffMs * (attempt + 1);
          if (e instanceof ValidationError) { hint = e.message; lastReason = "invalid_json"; wait = 0; }
          else if (e instanceof QueueTimeout) { lastReason = "rate_limited"; }
          else if (e instanceof RateLimited || /429|RESOURCE_EXHAUSTED/i.test(lastError)) { lastReason = "rate_limited"; wait = backoffMs * 5; }
          else if ((e as Error)?.name === "AbortError" || e instanceof Timeout) { lastReason = "timeout"; wait = 0; }
          else if (/503|UNAVAILABLE|500|ECONNRESET|ECONNREFUSED|fetch failed/i.test(lastError)) { lastReason = "error"; }
          else break; // unknown error: retrying won't help
          if (attempt < attempts - 1) await sleep(wait);
        }
      }

      if (fallbackMode === "static") {
        const r = staticGetOptions(req);
        return { moves: r.moves, meta: { ...r.meta, ...base, usedProvider: "static", fallbackReason: lastReason, errorDetail: lastError, latencyMs: Date.now() - t0 } };
      }
      throw new LlmUnavailable(lastReason, lastError);
    },
  };
}

/** Clean up model output. Throws ValidationError (→ retry with the message as a hint) if it can't make 3 valid moves. */
function assemble(req: OptionsRequest, raws: ReturnType<typeof parseModelJson>, base: Partial<OptionsResult["meta"]>, retried: boolean): OptionsResult {
  const seen = new Set<string>();
  for (const id of req.excludeIds) { const t = catalogById.get(id)?.title; if (t) seen.add(normalizeTitle(t)); }
  for (const m of req.rejectedMoves ?? []) seen.add(normalizeTitle(m.title));
  for (const m of req.ctx.chosen) seen.add(normalizeTitle(m.title));
  const { moves, repaired } = repairMoves(raws, req.step, seen);

  let out: Move[] = moves;
  let didRepair = repaired || retried;
  if (req.rejectReason?.chip === "don't want to pay") {
    const free = out.filter((m) => m.cost === "free");
    if (free.length !== out.length) didRepair = true;
    out = free;
  }
  if (out.length > 3) { out = out.slice(0, 3); didRepair = true; }
  if (out.length < 3 || out.filter((m) => m.cost === "free").length < 2) {
    throw new ValidationError(
      `need exactly 3 distinct moves (not repeating earlier ones), at least 2 free and at most 1 paid; got ${out.length} usable (${out.filter((m) => m.cost === "free").length} free)`,
    );
  }
  return {
    moves: out,
    meta: {
      requestedProvider: base.requestedProvider!, usedProvider: base.requestedProvider!, model: base.model,
      promptVersion: base.promptVersion, latencyMs: base.latencyMs ?? 0, cacheHit: false,
      repaired: didRepair, relaxed: false, sources: out.map(() => "generated") as ("catalog" | "generated")[],
    },
  };
}
