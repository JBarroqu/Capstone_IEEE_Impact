import { GoogleGenAI } from "@google/genai";
import { config } from "../config";
import type { Backend } from "./backends";
import { RateLimited } from "./errors";
import { RateQueue } from "./queue";

const g = globalThis as unknown as { _gemini?: GoogleGenAI; _geminiQueues?: Map<string, RateQueue> };
const client = () => (g._gemini ??= new GoogleGenAI({ apiKey: config.geminiKey }));

/** Model ids (without "models/") this key can call generateContent on. */
export async function listGeminiModels(): Promise<string[]> {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
    headers: { "x-goog-api-key": config.geminiKey }, signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`gemini list ${res.status}`);
  const j = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  return (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name.replace(/^models\//, ""));
}

export function geminiBackend(model: string): Backend {
  // Free tier is ~10 req/min per model; each model gets its own budget.
  const queues = (g._geminiQueues ??= new Map());
  const queue = queues.get(model) ?? queues.set(model, new RateQueue(config.geminiRpm)).get(model)!;
  return {
    id: `gemini:${model}`, provider: "gemini", model, remote: true,
    acquire: (w) => queue.acquire(w),
    // Interactions API (Google's recommended API; generateContent is legacy). Stateless: every call carries its full
    // prompt and store:false, so nothing about the student is kept on Google's side beyond normal processing.
    // See docs/GEMINI-INTERACTIONS.md.
    async generate({ system, user, schema, temperature = 0.4 }, signal) {
      try {
        const res = await client().interactions.create(
          {
            model, input: user, system_instruction: system, store: false,
            response_format: { type: "text", mime_type: "application/json", schema: schema as Record<string, unknown> },
            // temperature is accepted by the API (and range-checked) but missing from the SDK's type.
            generation_config: { temperature } as Record<string, unknown>,
          },
          { signal, retries: { strategy: "none" } }, // the chain does retries and failover itself
        );
        return res.output_text ?? "";
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        if ((e as { status?: number }).status === 429 || /429|RESOURCE_EXHAUSTED/i.test(msg)) throw new RateLimited(msg);
        if ((e as Error)?.name === "APIUserAbortError") throw Object.assign(new Error("aborted"), { name: "AbortError" });
        throw e;
      }
    },
  };
}
