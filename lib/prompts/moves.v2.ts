import type { Move, OptionsRequest } from "../types";
import { FOCUSES, DOMAINS, FORMATS, ARCHETYPES } from "../types";
import { catalog, catalogById } from "../engine/catalog";

export const PROMPT_VERSION = "moves.v2";

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

Rules for every move:
- Concrete, doable, specific. Good: "Ship a PR that fixes one good-first-issue in a repo you already use". Bad: "Explore open source".
- Title: imperative, at most 60 characters. Detail: exactly one sentence.
- Do not invent club names, product, newsletter or company names, real people, or prices. If a move costs money, write [PRICE] in the detail.
- Offer a paid move only when a paid option is genuinely better than the free ones (for example being paired with a senior mentor). Most sets should be all free. Never make a paid move the only route to the goal.
- Do not include beginner moves (like "learn what Git is") unless the wish is explicitly beginner-level.
- Return exactly 3 moves: at least 2 with cost "free" (usually all 3), at most 1 with cost "paid". The 3 options must be meaningfully different from each other (different formats or approaches).

Step meaning:
- Move 1 (step 1): small and quick, a fast first win, under about 60 minutes.
- Move 2 (step 2): builds directly on what move 1 showed.
- Move 3 (step 3): the version the student actually ships.
- Steps 4 and 5 extend the path after move 3.

Output JSON only, matching the provided schema.`;

const fmt = (m: Pick<Move, "title" | "detail" | "minutes" | "cost">) =>
  `${m.title} — ${m.detail} (${m.minutes} min, ${m.cost})`;

const REJECT_HINTS: Record<string, string> = {
  "too big": "make the new options smaller and quicker",
  "too small": "make the new options bigger and more ambitious",
  "not my style": "change the format and approach entirely",
  "already done this": "avoid anything that repeats what they have already done",
  "don't want to pay": "make ALL three options free",
};

const WORKED_PATHS = `Worked paths (match this tone and granularity):
1) Wish "An impressive resume": Move 1 "Rebuild your resume from a gold-standard template" → Move 2 "Write down the gap your resume shows (strong projects, no internship)" → Move 3 options: "Join one club or group in your target field" / "Compete in a hackathon and ship a demo".
2) Wish "Learn DevOps": Move 1 "Choose AWS / Azure / GCP as your cloud lane" (each explained) → Move 2 "Work through that lane's free-tier quickstarts" → Move 3 "Build and deploy a small service in a hands-on sandbox".
3) Wish "Connect in the healthcare industry": Move 1 "Get matched with students who share your wish" → Move 2 "Join a small group of five to compare notes" → Move 3 (paid, optional, with a free alternative) "Be paired with a senior already working in the field".`;

export function buildPrompt(req: OptionsRequest, errorHint?: string) {
  const { ctx, step } = req;
  const examples = catalog
    .filter((m) => m.focus.some((f) => ctx.focus.includes(f)) && (m.step === step || m.step === Math.max(1, step - 1)))
    .slice(0, 8)
    .map((m) => `- ${fmt(m)}`)
    .join("\n");

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
  if (req.excludeIds.length) {
    const titles = req.excludeIds.map((id) => catalogById.get(id)?.title).filter(Boolean);
    if (titles.length) lines.push(`Also do not repeat: ${titles.join("; ")}`);
  }
  if (errorHint) lines.push(`Your previous answer was invalid: ${errorHint}. Fix it and answer again.`);

  const user = `${WORKED_PATHS}\n\nCatalog examples for reference:\n${examples}\n\n${lines.join("\n")}`;
  return { system: SYSTEM, user };
}
