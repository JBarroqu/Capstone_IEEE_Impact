import type { Backend } from "./backends";
import { RateLimited } from "./errors";

/** Free-tier services with an OpenAI-compatible API. Each is used only when its key is set. */
export const OPENAI_COMPAT = {
  groq: {
    label: "Groq",
    base: "https://api.groq.com/openai/v1",
    key: () => process.env.GROQ_API_KEY ?? "",
    pinned: () => process.env.GROQ_MODELS ?? "",
    prefer: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.1-8b-instant"],
    skip: /whisper|guard|tts|orpheus|playai|allam|compound/i,
  },
  openrouter: {
    label: "OpenRouter",
    base: "https://openrouter.ai/api/v1",
    key: () => process.env.OPENROUTER_API_KEY ?? "",
    pinned: () => process.env.OPENROUTER_MODELS ?? "",
    prefer: [] as string[],
    skip: /^(?!.*:free$)/, // free models only
  },
} as const;
export type OpenAiCompat = keyof typeof OPENAI_COMPAT;

/** Up to 3 chat models: pinned list if set, else the preferred ones that exist, then anything else allowed. */
export async function listOpenAiModels(p: OpenAiCompat): Promise<string[]> {
  const c = OPENAI_COMPAT[p];
  const pinned = c.pinned().split(",").map((s) => s.trim()).filter(Boolean);
  if (pinned.length) return pinned;
  const res = await fetch(`${c.base}/models`, { headers: { authorization: `Bearer ${c.key()}` }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`${p} list ${res.status}`);
  const ids = ((await res.json()) as { data?: { id: string }[] }).data?.map((m) => m.id).filter((id) => !c.skip.test(id)) ?? [];
  const pref = c.prefer.filter((m) => ids.includes(m));
  return [...pref, ...ids.filter((id) => !pref.includes(id))].slice(0, 3);
}

export function openAiBackend(p: OpenAiCompat, model: string): Backend {
  const c = OPENAI_COMPAT[p];
  return {
    id: `${p}:${model}`, provider: p, model, remote: true,
    async generate({ system, user, schema }, signal) {
      const res = await fetch(`${c.base}/chat/completions`, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${c.key()}` },
        body: JSON.stringify({
          model, temperature: 0.4, response_format: { type: "json_object" },
          // These APIs don't all accept a JSON schema, so it goes in the prompt.
          messages: [{ role: "system", content: `${system}\n\nReturn a JSON object matching this JSON schema:\n${JSON.stringify(schema)}` }, { role: "user", content: user }],
        }),
      });
      if (res.status === 429) throw new RateLimited(`${p} 429`);
      if (!res.ok) throw new Error(`${p} ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
      const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return j.choices?.[0]?.message?.content ?? "";
    },
  };
}
