import { config } from "../config";
import { movesJsonSchema } from "../prompts/moves.v2";
import { llmOpts, makeLlmProvider, type Generate } from "./llm";

export function ollamaProvider() {
  const generate: Generate = async ({ system, user }, signal) => {
    const res = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: config.ollamaModel,
        stream: false,
        format: movesJsonSchema,
        options: { temperature: 0.4 },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}`);
    const json = (await res.json()) as { message?: { content?: string } };
    return json.message?.content ?? "";
  };
  return makeLlmProvider("ollama", config.ollamaModel, generate, config.llmTimeoutMs, undefined, llmOpts);
}
