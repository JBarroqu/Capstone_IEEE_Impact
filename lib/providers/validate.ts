import { z } from "zod";
import { createHash } from "node:crypto";
import { ARCHETYPES, DOMAINS, FOCUSES, FORMATS, type Move, type Step } from "../types";

export const rawMoveSchema = z.object({
  title: z.string().min(1),
  detail: z.string().min(1),
  step: z.number().int().min(1).max(5),
  focus: z.array(z.enum(FOCUSES)).min(1),
  domains: z.array(z.enum(DOMAINS)).min(1),
  minutes: z.number().int().min(1).max(100000),
  cost: z.enum(["free", "paid"]),
  format: z.enum(FORMATS),
  archetypeFit: z.partialRecord(z.enum(ARCHETYPES), z.number().min(0).max(1)).optional(),
});
export const rawResponseSchema = z.object({ moves: z.array(rawMoveSchema).min(3) });
export type RawMove = z.infer<typeof rawMoveSchema>;

export class ValidationError extends Error {}

/** Lowercase, letters/digits/spaces only: two titles that differ only in punctuation or case count as the same move. */
export function normalizeTitle(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

export function parseModelJson(text: string): RawMove[] {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new ValidationError("response was not valid JSON");
  }
  const r = rawResponseSchema.safeParse(json);
  if (!r.success) throw new ValidationError(r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data.moves;
}

export function genId(title: string, step: number) {
  return "gen-" + createHash("sha1").update(`${normalizeTitle(title)}|${step}`).digest("hex").slice(0, 10);
}

const truncate = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…");
const oneSentence = (s: string) => {
  const m = s.trim().match(/^.*?[.!?](?=\s|$)/);
  return m ? m[0] : s.trim();
};

export function toMove(raw: RawMove, step: Step): Move {
  const title = truncate(raw.title.trim(), 60);
  return {
    id: genId(title, step),
    title,
    detail: oneSentence(raw.detail),
    step,
    focus: raw.focus,
    domains: raw.domains,
    minutes: raw.minutes,
    cost: raw.cost,
    format: raw.format,
    archetypeFit: raw.archetypeFit ?? {},
  };
}

/**
 * Turn raw model output into up to 3 clean moves: dedupe against `seenTitles`,
 * cap paid at 1. The caller asks the model again if fewer than 3 or fewer than 2 free remain.
 * Returns whether any repair happened.
 */
export function repairMoves(raws: RawMove[], step: Step, seenTitles: Set<string>) {
  let repaired = false;
  const out: Move[] = [];
  const local = new Set(seenTitles);
  for (const raw of raws) {
    const m = toMove(raw, step);
    const key = normalizeTitle(m.title);
    if (local.has(key)) { repaired = true; continue; }
    local.add(key);
    out.push(m);
  }
  if (out.length !== raws.length) repaired = true;
  // enforce ≤1 paid: keep the first paid (model's own ordering as proxy for best-scored)
  let paidSeen = false;
  const kept = out.filter((m) => {
    if (m.cost !== "paid") return true;
    if (paidSeen) { repaired = true; return false; }
    paidSeen = true;
    return true;
  });
  return { moves: kept, repaired };
}
