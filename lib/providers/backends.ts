import { config } from "../config";
import { geminiBackend, listGeminiModels } from "./gemini";
import { listOllamaModels, ollamaBackend } from "./ollama";
import { listOpenAiModels, OPENAI_COMPAT, openAiBackend, type OpenAiCompat } from "./openai";

export type BackendProvider = "gemini" | "ollama" | OpenAiCompat;

/** One model at one provider. `generate` returns raw model text; the schema is the expected JSON shape. */
export type Backend = {
  id: string; // "gemini:gemini-3.5-flash-lite"
  provider: BackendProvider;
  model: string;
  remote: boolean;
  generate(p: { system: string; user: string; schema: object; temperature?: number }, signal: AbortSignal): Promise<string>;
  /** Optional per-backend rate limit; resolves when a slot is free, rejects (QueueTimeout) if the wait would exceed maxWaitMs. */
  acquire?(maxWaitMs: number): Promise<void>;
};

const GEMINI_SKIP = /(tts|image|audio|live|embed|vision|robotics|computer|omni|nano|banana|thinking|exp|learnlm|gemma|aqa|veo|imagen|native|dialog|search|research|customtools|-\d{3}$)/;

/**
 * Order Gemini model ids for move generation: lite, then flash, then pro; stable before preview/-latest; newest version first.
 * Unknown shapes are dropped. Pure, for tests.
 */
export function rankGeminiModels(ids: string[]): string[] {
  const score = (id: string) => {
    const tier = /flash-lite/.test(id) ? 0 : /flash/.test(id) ? 1 : 2;
    const unstable = /preview|latest/.test(id) ? 0.5 : 0;
    const v = Number(id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
    return { k: tier + unstable, v };
  };
  return [...new Set(ids.map((id) => id.replace(/^models\//, "")))]
    .filter((id) => /^gemini-/.test(id) && /flash|pro/.test(id) && !GEMINI_SKIP.test(id))
    .sort((a, b) => { const x = score(a), y = score(b); return x.k - y.k || y.v - x.v || a.localeCompare(b); });
}

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** Every backend this server can use for the configured MOVE_PROVIDER, in fallback order. */
async function discover(): Promise<Backend[]> {
  const mode = config.provider;
  const out: Backend[] = [];
  if ((mode === "auto" || mode === "gemini") && config.geminiKey) {
    const pinned = list(config.geminiModels);
    const found = pinned.length ? pinned : rankGeminiModels(await listGeminiModels().catch(() => [])).slice(0, config.geminiMaxModels);
    // If listing fails (network down at boot), keep a known-good default so the chain is never empty.
    for (const m of found.length ? found : ["gemini-3.5-flash-lite", "gemini-flash-lite-latest"]) out.push(geminiBackend(m));
  }
  if (mode === "auto") {
    for (const p of Object.keys(OPENAI_COMPAT) as OpenAiCompat[]) {
      if (!OPENAI_COMPAT[p].key()) continue;
      const models = await listOpenAiModels(p).catch(() => [] as string[]);
      for (const m of models) out.push(openAiBackend(p, m));
    }
  }
  if (mode === "auto" || mode === "ollama") {
    for (const m of await listOllamaModels().catch(() => [] as string[])) out.push(ollamaBackend(m));
  }
  return out;
}

const g = globalThis as unknown as { _backends?: { at: number; p: Promise<Backend[]> } };
const TTL = 10 * 60_000;

/** Cached discovery (10 min). `refresh` forces a new listing, e.g. from the admin page. */
export function getBackends(refresh = false): Promise<Backend[]> {
  if (refresh || !g._backends || Date.now() - g._backends.at > TTL) {
    const p = discover();
    g._backends = { at: Date.now(), p };
    p.then((b) => { if (!b.length && g._backends?.p === p) g._backends.at = 0; }); // retry discovery soon if empty
  }
  return g._backends.p;
}

/** Names of outside services student text may be sent to (for the consent screen). */
export function remoteServices(): string[] {
  const s: string[] = [];
  if (config.provider === "auto" || config.provider === "gemini") if (config.geminiKey) s.push("Google Gemini");
  if (config.provider === "auto") for (const p of Object.keys(OPENAI_COMPAT) as OpenAiCompat[]) if (OPENAI_COMPAT[p].key()) s.push(OPENAI_COMPAT[p].label);
  return s;
}
