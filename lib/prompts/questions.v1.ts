import { z } from "zod";
import type { QuestionSet, WishContext } from "../types";
import { ValidationError } from "../providers/validate";

/** Bump on any edit to the prompt or schema. */
export const QUESTIONS_VERSION = "questions.v1";
export const QUESTIONS_TEMPERATURE = 0.7;

export const questionsJsonSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array", minItems: 3, maxItems: 3,
      items: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          answers: { type: "array", minItems: 3, maxItems: 4, items: { type: "string" } },
          note: { type: "string" },
        },
        required: ["prompt", "answers", "note"],
      },
    },
  },
  required: ["questions"],
} as const;

const SYSTEM = `You write 3 short follow-up questions for a senior computer science student who has told us a wish (something they want to make happen) and, optionally, why and what they already tried.
The answers will be used to tailor three first moves for this wish, so each question must dig into something that is still unclear about THIS wish and would change which moves fit. Do not ask about anything they already told us.

Good questions are about their situation, constraints and preferences for this wish: how far along they are, how much time they have, what has blocked them, what a good outcome looks like, whether they prefer working alone or with people. Do not suggest moves, tools or resources inside a question or an answer.

Rules:
- Exactly 3 questions, each answerable with one tap: 3 or 4 short answers (at most 6 words each) that cover the realistic range and do not overlap.
- Question: one plain sentence, at most 90 characters, addressed to the student as "you".
- note: one short phrase saying what the answer tells the move writer (not shown to the student).
- No personality quiz, no yes/no questions, no free-text answers.

Output JSON only, matching the provided schema.`;

export function buildQuestionsPrompt(ctx: Pick<WishContext, "wishText" | "type" | "focus" | "domains" | "why" | "prior">, hint?: string) {
  const lines = [
    `Wish: ${JSON.stringify(ctx.wishText)}`,
    `Type: ${ctx.type}. Focus: ${ctx.focus.join(", ") || "unknown"}. Domain: ${ctx.domains.join(", ") || "unknown"}.`,
    ctx.why ? `Why they want it: ${JSON.stringify(ctx.why)}` : "Why: not given.",
    ctx.prior.chips.length || ctx.prior.text
      ? `Already tried and didn't like: ${[...ctx.prior.chips, ctx.prior.text].filter(Boolean).join("; ")}`
      : "Already tried: not given.",
  ];
  if (hint) lines.push(`Your previous answer was rejected: ${hint}. Fix it.`);
  return { system: SYSTEM, user: lines.join("\n") };
}

const schema = z.object({
  questions: z.array(z.object({
    prompt: z.string().trim().min(5).max(140),
    answers: z.array(z.string().trim().min(1).max(60)).min(3).max(4),
    note: z.string().trim().max(200).default(""),
  })).min(3),
});

/** Throws ValidationError so the chain retries with the problem as a hint. Ids are positional (g1..g3, a..d). */
export function parseQuestions(text: string): QuestionSet["questions"] {
  let json: unknown;
  try { json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { throw new ValidationError("response was not valid JSON"); }
  const r = schema.safeParse(json);
  if (!r.success) throw new ValidationError(r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const qs = r.data.questions.slice(0, 3);
  for (const q of qs) {
    if (new Set(q.answers.map((a) => a.toLowerCase())).size !== q.answers.length) throw new ValidationError(`question "${q.prompt}" has duplicate answers`);
  }
  return qs.map((q, i) => ({
    id: `g${i + 1}`, prompt: q.prompt, note: q.note,
    answers: q.answers.map((label, j) => ({ id: "abcd"[j], label })),
  }));
}
