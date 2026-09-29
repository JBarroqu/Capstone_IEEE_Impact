import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { config } from "../config";
import { PROMPT_VERSION } from "../prompts/moves.v1";
import { staticGetOptions, normalizeTitle } from "../engine/select";
import type { Move, MoveProvider, OptionsRequest, OptionsResult } from "../types";
import { ollamaProvider } from "./ollama";
import { geminiProvider } from "./gemini";

export const staticProvider: MoveProvider = {
  name: "static",
  async getOptions(req) { return staticGetOptions(req); },
};

export function getProvider(name = config.provider): MoveProvider {
  if (name === "gemini") return config.geminiKey ? geminiProvider() : staticProvider;
  if (name === "ollama") return ollamaProvider();
  return staticProvider;
}

export type Store = {
  cacheGet(key: string): Promise<Move[] | null>;
  cacheSet(key: string, moves: Move[], provider: string, model?: string): Promise<void>;
  persistGenerated(req: OptionsRequest, moves: Move[], meta: OptionsResult["meta"]): Promise<void>;
};

export const dbStore: Store = {
  async cacheGet(key) {
    const { getDb, schema } = await import("../db/client");
    const rows = await getDb().select().from(schema.llmCache).where(eq(schema.llmCache.key, key)).limit(1);
    return (rows[0]?.moves as Move[]) ?? null;
  },
  async cacheSet(key, moves, provider, model) {
    const { getDb, schema } = await import("../db/client");
    await getDb().insert(schema.llmCache).values({ key, moves, provider, model }).onConflictDoNothing();
  },
  async persistGenerated(req, moves, meta) {
    if (!req.sessionId) return;
    const gen = moves.filter((m) => m.id.startsWith("gen-"));
    if (!gen.length) return;
    const { getDb, schema } = await import("../db/client");
    await getDb().insert(schema.generatedMoves).values(
      gen.map((m) => ({
        id: m.id, sessionId: req.sessionId!, wishId: req.wishId ?? null, step: req.step,
        move: m as unknown as Record<string, unknown>, provider: meta.usedProvider, model: meta.model,
        promptVersion: meta.promptVersion,
      })),
    ).onConflictDoNothing();
  },
};

export function cacheKey(req: OptionsRequest, provider: string) {
  const { ctx } = req;
  const parts = [
    normalizeTitle(ctx.wishText), [...ctx.focus].sort(), [...ctx.domains].sort(), ctx.archetype ?? "",
    req.step, [...req.excludeIds].sort(), ctx.chosen.map((m) => m.id), req.rejectReason?.chip ?? "",
    PROMPT_VERSION, provider, ctx.why ?? "", ctx.prior,
  ];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/** Entry point used by the API: provider + cache + persistence. Never throws. */
export async function getOptions(
  req: OptionsRequest,
  opts: { provider?: MoveProvider; store?: Store; cache?: boolean } = {},
): Promise<OptionsResult> {
  const provider = opts.provider ?? getProvider();
  const store = opts.store ?? dbStore;
  const useCache = (opts.cache ?? config.llmCache) && provider.name !== "static";
  const key = cacheKey(req, provider.name);
  const t0 = Date.now();

  if (useCache) {
    try {
      const hit = await store.cacheGet(key);
      if (hit?.length === 3) {
        return {
          moves: hit,
          meta: {
            requestedProvider: provider.name, usedProvider: provider.name, model: config.geminiModel,
            promptVersion: PROMPT_VERSION, latencyMs: Date.now() - t0, cacheHit: true, repaired: false,
            relaxed: false, sources: hit.map((m) => (m.id.startsWith("gen-") ? "generated" : "catalog")),
          },
        };
      }
    } catch { /* cache is best-effort */ }
  }

  let result: OptionsResult;
  try {
    result = await provider.getOptions(req);
  } catch {
    const r = staticGetOptions(req);
    result = { moves: r.moves, meta: { ...r.meta, requestedProvider: provider.name, fallbackReason: "error" } };
  }
  if (result.meta.usedProvider !== "static") {
    if (useCache) store.cacheSet(key, result.moves, result.meta.usedProvider, result.meta.model).catch(() => {});
    store.persistGenerated(req, result.moves, result.meta).catch(() => {});
  }
  return result;
}
