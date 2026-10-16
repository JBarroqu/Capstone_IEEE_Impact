import type { Move, OptionsRequest, OptionsResult, MoveProvider } from "../types";
import { buildPrompt, movesJsonSchema, PROMPT_VERSION } from "../prompts/moves.v2";
import { parseModelJson, repairMoves, ValidationError } from "./validate";
import { staticGetOptions, normalizeTitle } from "../engine/select";
import { catalogById } from "../engine/catalog";
import { config } from "../config";
import { getBackends, type Backend } from "./backends";
import { health as sharedHealth, type Health } from "./health";
import { getPreferredBackend } from "./prefs";
import { runLlm, type LlmTask, type RunResult } from "./run";
import { LlmUnavailable } from "./errors";

export { LlmUnavailable, RateLimited, Timeout, type FailReason } from "./errors";

export type ChainOptions = {
  backends?: () => Promise<Backend[]>;
  health?: Health;
  preferred?: () => Promise<string | null>;
  timeoutMs?: number;
  budgetMs?: number;
  /** "static" substitutes catalog moves when the whole chain fails. Default "none": fail loudly instead. */
  fallback?: "none" | "static";
};

/** Run any task through the model chain with production defaults (overridable for tests). */
export async function runChain<T>(task: LlmTask<T>, o: ChainOptions = {}): Promise<RunResult<T>> {
  const [backends, preferred] = await Promise.all([(o.backends ?? getBackends)(), (o.preferred ?? getPreferredBackend)().catch(() => null)]);
  return runLlm(task, {
    backends, preferred, health: o.health ?? sharedHealth,
    timeoutMs: o.timeoutMs ?? config.llmTimeoutMs, budgetMs: o.budgetMs ?? config.llmBudgetMs,
  });
}

/** Moves from the model chain. Every option is LLM-generated; nothing is substituted unless fallback is "static". */
export function chainProvider(o: ChainOptions = {}): MoveProvider {
  const name = config.provider === "static" ? "auto" : config.provider;
  return {
    name,
    async getOptions(req: OptionsRequest): Promise<OptionsResult> {
      const t0 = Date.now();
      const task: LlmTask<Move[]> = {
        schema: movesJsonSchema,
        build: (hint) => buildPrompt(req, hint),
        parse: (text) => assemble(req, parseModelJson(text)),
      };
      try {
        const r = await runChain(task, o);
        return {
          moves: r.value,
          meta: {
            requestedProvider: name, usedProvider: r.backend.provider, model: r.backend.model, promptVersion: PROMPT_VERSION,
            latencyMs: r.latencyMs, cacheHit: false, repaired: r.repaired || repairedIds.has(r.value), relaxed: false,
            sources: r.value.map(() => "generated" as const), tried: r.tried.map((t) => `${t.id}:${t.reason}`),
          },
        };
      } catch (e) {
        if ((o.fallback ?? config.llmFallback) !== "static" || !(e instanceof LlmUnavailable)) throw e;
        const s = staticGetOptions(req);
        return { moves: s.moves, meta: { ...s.meta, requestedProvider: name, usedProvider: "static", promptVersion: PROMPT_VERSION, fallbackReason: e.reason, errorDetail: e.detail, latencyMs: Date.now() - t0 } };
      }
    },
  };
}

// assemble() reports whether it had to fix the output; keyed by the returned array.
const repairedIds = new WeakSet<Move[]>();

/** Clean up model output. Throws ValidationError (→ retry with the message as a hint) if it can't make 3 valid moves. */
function assemble(req: OptionsRequest, raws: ReturnType<typeof parseModelJson>): Move[] {
  const seen = new Set<string>();
  for (const id of req.excludeIds) { const t = catalogById.get(id)?.title; if (t) seen.add(normalizeTitle(t)); }
  for (const m of req.rejectedMoves ?? []) seen.add(normalizeTitle(m.title));
  for (const m of req.ctx.chosen) seen.add(normalizeTitle(m.title));
  const { moves, repaired } = repairMoves(raws, req.step, seen);

  let out: Move[] = moves;
  let didRepair = repaired;
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
  if (didRepair) repairedIds.add(out);
  return out;
}
