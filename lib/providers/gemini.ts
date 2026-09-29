import { GoogleGenAI } from "@google/genai";
import { config } from "../config";
import { movesJsonSchema } from "../prompts/moves.v2";
import { makeLlmProvider, RateLimited, type Generate } from "./llm";
import { RateQueue } from "./queue";

// Gemini free tier is ~10 req/min for Flash-class models; keep under it.
const queue = new RateQueue(Number(process.env.GEMINI_RPM ?? 9));

export function geminiProvider() {
  const ai = new GoogleGenAI({ apiKey: config.geminiKey });
  const generate: Generate = async ({ system, user }, signal) => {
    try {
      const res = await ai.models.generateContent({
        model: config.geminiModel,
        contents: user,
        config: {
          systemInstruction: system,
          temperature: 0.4,
          responseMimeType: "application/json",
          responseJsonSchema: movesJsonSchema,
          abortSignal: signal,
        },
      });
      return res.text ?? "";
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (/429|RESOURCE_EXHAUSTED|rate/i.test(msg)) throw new RateLimited(msg);
      throw e;
    }
  };
  return makeLlmProvider("gemini", config.geminiModel, generate, config.llmTimeoutMs, (w) => queue.acquire(w));
}
