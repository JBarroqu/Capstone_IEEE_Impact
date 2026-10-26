import type { Move, OptionsRequest } from "../types";
import { FOCUSES, DOMAINS, FORMATS, ARCHETYPES } from "../types";

export const PROMPT_VERSION = "moves.v3";

/** Moves should vary between students with the same wish; classification keeps the backend default. */
export const MOVES_TEMPERATURE = 0.8;

/** JSON schema for one move (no id). Shared by Ollama `format` and Gemini `responseJsonSchema`. */
export const movesJsonSchema = {
  type: "object",
  properties: {
    moves: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          step: { type: "integer", minimum: 1, maximum: 5 },
          focus: { type: "array", items: { type: "string", enum: [...FOCUSES] } },
          domains: { type: "array", items: { type: "string", enum: [...DOMAINS] } },
          minutes: { type: "integer" },
          cost: { type: "string", enum: ["free", "paid"] },
          format: { type: "string", enum: [...FORMATS] },
          archetypeFit: {
            type: "object",
            properties: Object.fromEntries(ARCHETYPES.map((a) => [a, { type: "number" }])),
          },
        },
        required: ["title", "detail", "step", "focus", "domains", "minutes", "cost", "format"],
      },
    },
  },
  required: ["moves"],
} as const;

const SYSTEM = `You write "moves" for a student who has a wish and no first step.
Audience: senior computer science majors at a large public university in their final year (job search, new-grad offers, capstone, grad school applications, first real side projects). They are technically fluent, short on time, and allergic to generic advice.

Every move is written fresh for this student's wish and answers. There is no list of standard moves to draw from.

Rules for every move:
- Concrete, doable, specific to this wish. A vague move ("Explore the field", "Learn more about X") is a failure.
- Title: imperative, at most 60 characters. Detail: exactly one sentence.
- Name real tools, platforms, services, communities or companies when that makes the move more concrete. Only name ones that really exist, never invent a club, product or person, and never name private individuals. Do not state prices; if a move costs money, write [PRICE] in the detail.
- Offer a paid move only when a paid option is genuinely better than the free ones. Most sets should be all free. Never make a paid move the only route to the goal.
- Do not include beginner moves unless the wish is explicitly beginner-level.
- Return exactly 3 moves: at least 2 with cost "free" (usually all 3), at most 1 with cost "paid". The 3 options must be meaningfully different from each other (different formats or approaches), not three variations of one idea.

Step meaning:
- Move 1 (step 1): small and quick, a fast first win, under about 60 minutes.
- Move 2 (step 2): builds directly on what move 1 showed.
- Move 3 (step 3): the version the student actually ships.
- Steps 4 and 5 extend the path after move 3.

Output JSON only, matching the provided schema.`;

/**
 * Shows tone and granularity only. The topic is deliberately unrelated to anything a CS senior would wish for,
 * so there is nothing in it the model could copy into a real answer.
 */
const STYLE_EXAMPLE = `Style example (format and tone only; the topic is deliberately unrelated, do not reuse any of it):
Wish "Cook dinner at home most weeknights", move 1:
- Plan three dinners around one grocery run — Pick three recipes that share at least four ingredients and buy only those this weekend. (30 min, free, solo)
- Batch-cook one base and freeze four portions — Make a big pot of rice or beans on Sunday so weeknight dinners start half done. (60 min, free, solo)
- Cook along with a friend on a video call — Choose the same recipe, start at the same time, and compare results at the end. (45 min, free, peer)`;

const fmt = (m: Pick<Move, "title" | "detail" | "minutes" | "cost">) =>
  `${m.title} — ${m.detail} (${m.minutes} min, ${m.cost})`;

const REJECT_HINTS: Record<string, string> = {
  "too big": "make the new options smaller and quicker",
  "too small": "make the new options bigger and more ambitious",
  "not my style": "change the format and approach entirely",
  "already done this": "avoid anything that repeats what they have already done",
  "don't want to pay": "make ALL three options free",
};

export function buildPrompt(req: OptionsRequest, errorHint?: string) {
  const { ctx, step } = req;

  const lines: string[] = [
    `Wish: "${ctx.wishText}"`,
    `Type: ${ctx.type}. Focus: ${ctx.focus.join(", ") || "unknown"}. Domain: ${ctx.domains.join(", ") || "unknown"}.`,
  ];
  if (ctx.why) lines.push(`Why they want it: "${ctx.why}"`);
  if (ctx.prior.chips.length || ctx.prior.text)
    lines.push(
      `Already tried and didn't like: ${[...ctx.prior.chips, ctx.prior.text].filter(Boolean).join("; ")}. Rank these formats lower and avoid repeating them.`,
    );
  if (ctx.archetype) lines.push(`Archetype (affects ranking only): ${ctx.archetype}.`);
  if (ctx.chosen.length)
    lines.push(`Moves already locked in:\n${ctx.chosen.map((m, i) => `${i + 1}. ${fmt(m)}`).join("\n")}`);
  lines.push(`Now write the options for move ${step}. Set "step" to ${step} on every move.`);
  if (req.rejectedMoves?.length || req.rejectReason) {
    const reason = req.rejectReason;
    const hint = reason?.chip ? REJECT_HINTS[reason.chip] : undefined;
    lines.push(
      `The student rejected these options for this step:\n${(req.rejectedMoves ?? [])
        .map((m) => `- ${m.title}`)
        .join("\n")}\nReason: ${[reason?.chip, reason?.text].filter(Boolean).join(" — ") || "not given"}.${hint ? ` So: ${hint}.` : ""} Do not repeat or lightly reword them.`,
    );
  }
  if (req.excludeTitles?.length) lines.push(`Already shown to the student for this step, do not repeat or lightly reword: ${req.excludeTitles.join("; ")}`);
  if (errorHint) lines.push(`Your previous answer was invalid: ${errorHint}. Fix it and answer again.`);

  const user = `${STYLE_EXAMPLE}\n\n${lines.join("\n")}`;
  return { system: SYSTEM, user };
}
