import keywords from "../../data/keywords.json";
import { DOMAINS, FOCUSES, type Domain, type Focus } from "../types";

export type Classification = { domains: Domain[]; focus: Focus[]; confidence: number };

function scoreMap(text: string, map: Record<string, string[]>) {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9+\- ]/g, " ")} `;
  const out: Record<string, number> = {};
  for (const [k, words] of Object.entries(map)) {
    out[k] = words.reduce((n, w) => n + (t.includes(` ${w} `) || (w.length > 4 && t.includes(w)) ? 1 : 0), 0);
  }
  return out;
}

function top<T extends string>(scores: Record<string, number>, order: readonly T[], max: number): T[] {
  return order
    .map((k) => [k, scores[k] ?? 0] as const)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))
    .slice(0, max)
    .map(([k]) => k);
}

/** Keyword classifier. Unknown text → empty guesses (no preselection). */
export function classifyWish(text: string): Classification {
  const d = scoreMap(text, keywords.domains);
  const f = scoreMap(text, keywords.focus);
  const domains = top(d, DOMAINS, 2);
  const focus = top(f, FOCUSES, 2);
  const hits = Object.values(d).reduce((a, b) => a + b, 0) + Object.values(f).reduce((a, b) => a + b, 0);
  const confidence = Math.min(1, hits / 4);
  return { domains, focus, confidence };
}
