import { config } from "../config";
import type { Backend } from "./backends";

/** Pulled models on the local Ollama server; [] if it is not running. OLLAMA_MODEL (if pulled) goes first. */
export async function listOllamaModels(): Promise<string[]> {
  const res = await fetch(`${config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(1000) });
  if (!res.ok) return [];
  const j = (await res.json()) as { models?: { name: string }[] };
  const names = (j.models ?? []).map((m) => m.name).filter((n) => !/embed/i.test(n));
  const pref = names.find((n) => n === config.ollamaModel || n === `${config.ollamaModel}:latest`);
  return (pref ? [pref, ...names.filter((n) => n !== pref)] : names).slice(0, 2);
}

export function ollamaBackend(model: string): Backend {
  return {
    id: `ollama:${model}`, provider: "ollama", model, remote: false,
    async generate({ system, user, schema }, signal) {
      const res = await fetch(`${config.ollamaUrl}/api/chat`, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model, stream: false, format: schema, options: { temperature: 0.4 },
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
      });
      if (!res.ok) throw new Error(`ollama ${res.status}`);
      const json = (await res.json()) as { message?: { content?: string } };
      return json.message?.content ?? "";
    },
  };
}
