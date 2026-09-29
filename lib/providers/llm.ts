import type { Move, OptionsRequest, OptionsResult, MoveProvider } from "../types";
import { buildPrompt, PROMPT_VERSION } from "../prompts/moves.v1";
import { parseModelJson, repairMoves, ValidationError } from "./validate";
import { staticGetOptions, normalizeTitle, pickThree } from "../engine/select";
import { catalog, catalogById } from "../engine/catalog";
import { QueueTimeout } from "./queue";

export type Generate = (prompt: { system: string; user: string }, signal: AbortSignal) => Promise<string>;

export class RateLimited extends Error {}
export class Timeout extends Error {}

export function makeLlmProvider(
  name: "ollama" | "gemini",
  model: string,
  generate: Generate,
  timeoutMs: number,
  before?: (maxWaitMs: number) => Promise<void>,
): MoveProvider {
  return {
    name,
    async getOptions(req: OptionsRequest): Promise<OptionsResult> {
      const t0 = Date.now();
      const base = { requestedProvider: name, model, promptVersion: PROMPT_VERSION };
      const fallback = (reason: NonNullable<OptionsResult["meta"]["fallbackReason"]>): OptionsResult => {
        const r = staticGetOptions(req);
        return { moves: r.moves, meta: { ...r.meta, ...base, usedProvider: "static", fallbackReason: reason, latencyMs: Date.now() - t0 } };
      };

      const deadline = t0 + timeoutMs;
      let hint: string | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) return fallback("timeout");
        try {
          await before?.(remaining);
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), Math.max(1, deadline - Date.now()));
          let text: string;
          try {
            text = await generate(buildPrompt(req, hint), ctrl.signal);
          } finally {
            clearTimeout(timer);
          }
          const raws = parseModelJson(text);
          return assemble(req, raws, { ...base, latencyMs: Date.now() - t0 }, attempt > 0);
        } catch (e) {
          if (e instanceof ValidationError) { hint = e.message; if (attempt === 1) return fallback("invalid_json"); continue; }
          if (e instanceof QueueTimeout) return fallback("rate_limited");
          if (e instanceof RateLimited) return fallback("rate_limited");
          if ((e as Error)?.name === "AbortError" || e instanceof Timeout) return fallback("timeout");
          return fallback("error");
        }
      }
      return fallback("invalid_json");
    },
  };
}

function assemble(req: OptionsRequest, raws: ReturnType<typeof parseModelJson>, base: Partial<OptionsResult["meta"]>, retried: boolean): OptionsResult {
  const seen = new Set<string>();
  for (const id of req.excludeIds) { const t = catalogById.get(id)?.title; if (t) seen.add(normalizeTitle(t)); }
  for (const m of req.rejectedMoves ?? []) seen.add(normalizeTitle(m.title));
  for (const m of req.ctx.chosen) seen.add(normalizeTitle(m.title));
  const { moves, repaired } = repairMoves(raws, req.step, seen);

  let out: Move[] = moves.slice(0, 3);
  let didRepair = repaired || retried;
  const freeOnly = req.rejectReason?.chip === "don't want to pay";
  if (freeOnly) { const f = out.filter((m) => m.cost === "free"); if (f.length !== out.length) didRepair = true; out = f; }
  const need = out.length < 3 || out.filter((m) => m.cost === "free").length < 2;
  if (need) {
    didRepair = true;
    const exclude = [...req.excludeIds, ...out.map((m) => m.id)];
    const back = staticGetOptions({ ...req, excludeIds: exclude }, catalog.filter((m) => m.cost === "free"));
    const seenNow = new Set(out.map((m) => normalizeTitle(m.title)));
    for (const m of back.moves) if (out.length < 3 && !seenNow.has(normalizeTitle(m.title))) out.push(m);
    out = pickThree(out).slice(0, 3);
  }
  const sources = out.map((m) => (m.id.startsWith("gen-") ? "generated" : "catalog")) as ("catalog" | "generated")[];
  return {
    moves: out,
    meta: {
      requestedProvider: base.requestedProvider!, usedProvider: base.requestedProvider!, model: base.model,
      promptVersion: base.promptVersion, latencyMs: base.latencyMs ?? 0, cacheHit: false,
      repaired: didRepair, relaxed: false, sources,
    },
  };
}
