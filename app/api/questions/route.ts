import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { quiz } from "@/lib/archetypes";
import { buildQuestionsPrompt, parseQuestions, QUESTIONS_TEMPERATURE, QUESTIONS_VERSION, questionsJsonSchema } from "@/lib/prompts/questions.v1";
import { runChain, LlmUnavailable } from "@/lib/providers/llm";
import { DOMAINS, FOCUSES, type QuestionSet } from "@/lib/types";

const body = z.object({
  wishText: z.string().min(1).max(500), type: z.enum(["open_ended", "fixed"]),
  focus: z.array(z.enum(FOCUSES)).max(10), domains: z.array(z.enum(DOMAINS)).max(10),
  why: z.string().max(1000).optional(),
  prior: z.object({ chips: z.array(z.string().max(40)).max(10), text: z.string().max(1000).optional() }).default({ chips: [] }),
});

/**
 * Three follow-up questions written for this wish (stateless: the prompt carries everything, see
 * docs/GEMINI-INTERACTIONS.md). If every model fails, the fixed placeholder quiz answers instead (source: "fixed"),
 * like classification falls back to keywords; it only steers the moves, so it never blocks the student.
 */
export async function POST(req: Request) {
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: p.error.message }, { status: 400 });
  const t0 = Date.now();
  try {
    const r = await runChain(
      { schema: questionsJsonSchema, temperature: QUESTIONS_TEMPERATURE, build: (hint) => buildQuestionsPrompt(p.data, hint), parse: parseQuestions },
      { budgetMs: config.questionsBudgetMs },
    );
    const set: QuestionSet = {
      source: "llm", questions: r.value, provider: r.backend.provider, model: r.backend.model, promptVersion: QUESTIONS_VERSION,
      latencyMs: r.latencyMs, tried: r.tried.map((t) => `${t.id}:${t.reason}`),
    };
    return NextResponse.json({ ok: true, ...set });
  } catch (e) {
    console.error("questions failed, using the fixed quiz:", e instanceof Error ? e.message : e);
    const set: QuestionSet = {
      source: "fixed", questions: quiz.map((q) => ({ id: q.id, prompt: q.prompt, note: "", answers: q.answers.map((a) => ({ id: a.id, label: a.label })) })),
      latencyMs: Date.now() - t0, failReason: e instanceof LlmUnavailable ? e.reason : "error",
    };
    return NextResponse.json({ ok: true, ...set });
  }
}
