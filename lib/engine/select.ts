import type { Archetype, Move, OptionsRequest, OptionsResult, WishContext } from "../types";
import { catalog } from "./catalog";

const overlap = <T,>(a: T[], b: T[]) => a.filter((x) => b.includes(x)).length;

export function scoreMove(m: Move, ctx: WishContext, chosenIds: Set<string>): number {
  let s = overlap(m.focus, ctx.focus) + overlap(m.domains, ctx.domains);
  if (ctx.archetype) s += m.archetypeFit[ctx.archetype as Archetype] ?? 0;
  if (ctx.prior.chips.some((c) => chipToFormats[c]?.includes(m.format))) s -= 1.5;
  if (m.requires?.length && m.requires.every((r) => chosenIds.has(r))) s += 0.5;
  return s;
}

/** Prior-attempt chips → move formats that should rank lower. */
export const chipToFormats: Record<string, Move["format"][]> = {
  "online course": ["course"],
  youtube: ["course", "solo"],
  "a club": ["group", "event"],
};

export function normalizeTitle(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/** Ensure ≥2 free and ≤1 paid among top 3, backfilling from ranked list. */
export function pickThree(ranked: Move[]): Move[] {
  const out: Move[] = [];
  let paid = 0;
  for (const m of ranked) {
    if (out.length === 3) break;
    if (m.cost === "paid") { if (paid >= 1) continue; paid++; }
    out.push(m);
  }
  // guarantee at least 2 free if enough free exist
  while (out.filter((m) => m.cost === "free").length < 2) {
    const free = ranked.find((m) => m.cost === "free" && !out.includes(m));
    const paidIdx = out.findIndex((m) => m.cost === "paid");
    if (!free || paidIdx < 0) break;
    out[paidIdx] = free;
  }
  return out;
}

export function staticGetOptions(req: OptionsRequest, pool: Move[] = catalog): OptionsResult {
  const t0 = Date.now();
  const { ctx, step } = req;
  const chosenIds = new Set(ctx.chosen.map((m) => m.id));
  const exclude = new Set([...req.excludeIds, ...chosenIds]);
  const avail = pool.filter((m) => !exclude.has(m.id));
  const freeOnly = req.rejectReason?.chip === "don't want to pay";

  const stage = (stepMatch: boolean, dom: boolean, foc: boolean) =>
    avail.filter(
      (m) =>
        (!stepMatch || m.step === step) &&
        (!dom || overlap(m.domains, ctx.domains) > 0 || !ctx.domains.length) &&
        (!foc || overlap(m.focus, ctx.focus) > 0 || !ctx.focus.length) &&
        (!freeOnly || m.cost === "free"),
    );

  const relaxations: [boolean, boolean, boolean][] = [
    [true, true, true], [true, false, true], [true, false, false], [false, false, false],
  ];
  let cands: Move[] = [];
  let relaxed = false;
  for (let i = 0; i < relaxations.length; i++) {
    cands = stage(...relaxations[i]);
    if (cands.length >= 3) { relaxed = i > 0; break; }
    relaxed = i > 0;
  }

  const ranked = [...cands].sort(
    (a, b) => scoreMove(b, ctx, chosenIds) - scoreMove(a, ctx, chosenIds) || a.id.localeCompare(b.id),
  );
  let moves = pickThree(ranked);
  if (moves.length < 3) {
    // last resort: any remaining catalog move at all
    const rest = avail.filter((m) => !moves.includes(m) && (!freeOnly || m.cost === "free")).sort((a, b) => a.id.localeCompare(b.id));
    moves = pickThree([...moves, ...rest]);
  }
  if (process.env.SHUFFLE_POSITIONS === "true") moves = seededShuffle(moves, `${ctx.wishText}|${step}|${req.rerollIndex}`);

  return {
    moves,
    meta: {
      requestedProvider: "static", usedProvider: "static", latencyMs: Date.now() - t0,
      cacheHit: false, repaired: false, relaxed, sources: moves.map(() => "catalog"),
    },
  };
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 2 ** 32);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
