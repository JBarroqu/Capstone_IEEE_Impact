import { z } from "zod";
import { DOMAINS, FOCUSES, type Domain, type Focus, type WishType } from "../types";
import { ValidationError } from "../providers/validate";

/** Bump on any edit to the prompt or schema. */
export const CLASSIFY_VERSION = "classify.v1";

export type WishClass = { focus: Focus[]; domains: Domain[]; type: WishType };

export const classifyJsonSchema = {
  type: "object",
  properties: {
    focus: { type: "array", minItems: 1, maxItems: 2, items: { type: "string", enum: [...FOCUSES] } },
    domains: { type: "array", minItems: 1, maxItems: 2, items: { type: "string", enum: [...DOMAINS] } },
    type: { type: "string", enum: ["fixed", "open_ended"] },
  },
  required: ["focus", "domains", "type"],
} as const;

const SYSTEM = `You categorize a wish written by a senior computer science student. Output JSON only, matching the provided schema.

focus (1 or 2, most important first): what kind of wish it is.
- learn: understand a topic or skill
- goal: hit a specific target (an offer, an admission, a grade, a certification)
- system: build a habit or routine
- advance: ship something or level up existing work
- lead: guide or organize other people
- connect: meet or build relationships with the right people

domains (1 or 2, most important first): which area of their life it belongs to.
- career: jobs, internships, industry
- academic: courses, grades, research, grad school
- technical: engineering skills, tools, building software
- venture: startups, side businesses, social impact projects
- leadership: clubs, teams, mentoring, networks

type: "fixed" if the wish has a clear finish line you could check off, otherwise "open_ended".`;

export function buildClassifyPrompt(wishText: string, hint?: string) {
  const user = `Wish: ${JSON.stringify(wishText)}${hint ? `\n\nYour previous answer was rejected: ${hint}. Fix it.` : ""}`;
  return { system: SYSTEM, user };
}

const schema = z.object({
  focus: z.array(z.enum(FOCUSES)).min(1),
  domains: z.array(z.enum(DOMAINS)).min(1),
  type: z.enum(["fixed", "open_ended"]),
});

/** Throws ValidationError so the chain retries with the problem as a hint. */
export function parseClassify(text: string): WishClass {
  let json: unknown;
  try { json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { throw new ValidationError("response was not valid JSON"); }
  const r = schema.safeParse(json);
  if (!r.success) throw new ValidationError(r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const uniq = <T,>(a: T[]) => [...new Set(a)].slice(0, 2);
  return { focus: uniq(r.data.focus), domains: uniq(r.data.domains), type: r.data.type };
}
