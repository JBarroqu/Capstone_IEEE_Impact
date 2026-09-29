import type { Move } from "./types";

export type EventRow = {
  id?: string; createdAt: Date | string; sessionId: string; wishId: string | null; participantCode: string;
  theme: string; provider: string | null; name: string; step: number | null; payload: Record<string, any>;
};
export type WishRow = {
  id: string; sessionId: string; text: string; type: string | null; focus: string[] | null; domains: string[] | null;
  archetype: string | null; why: string | null;
};
export type MoveMeta = Pick<Move, "id" | "title" | "step" | "focus" | "cost"> & { source: "catalog" | "generated" };

const median = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 100) / 100 : null);
const count = (xs: string[]) => xs.reduce<Record<string, number>>((o, x) => ((o[x] = (o[x] ?? 0) + 1), o), {});
const sessionsWith = (ev: EventRow[], name: string, pred: (e: EventRow) => boolean = () => true) =>
  new Set(ev.filter((e) => e.name === name && pred(e)).map((e) => e.sessionId)).size;

export function funnel(ev: EventRow[]) {
  return [
    { label: "Sessions", n: sessionsWith(ev, "session_started") },
    { label: "Consented", n: sessionsWith(ev, "consent_given") },
    { label: "Wish submitted", n: sessionsWith(ev, "wish_submitted") },
    { label: "Move 1 locked", n: sessionsWith(ev, "move_locked", (e) => e.step === 1) },
    { label: "Move 2 locked", n: sessionsWith(ev, "move_locked", (e) => e.step === 2) },
    { label: "Move 3 locked", n: sessionsWith(ev, "move_locked", (e) => e.step === 3) },
    { label: "Path rated", n: sessionsWith(ev, "path_rated") },
  ];
}

export function leaderboard(ev: EventRow[], meta: Map<string, MoveMeta>) {
  type Acc = { shown: number; picked: number; rejected: number; ms: number[]; posShown: number[]; posPicked: number[] };
  const acc = new Map<string, Acc>();
  const get = (id: string) => {
    let a = acc.get(id);
    if (!a) acc.set(id, (a = { shown: 0, picked: 0, rejected: 0, ms: [], posShown: [0, 0, 0], posPicked: [0, 0, 0] }));
    return a;
  };
  for (const e of ev) {
    const p = e.payload;
    if (e.name === "options_shown") (p.move_ids as string[] | undefined)?.forEach((id, i) => { const a = get(id); a.shown++; if (i < 3) a.posShown[i]++; });
    else if (e.name === "move_locked" && p.move_id) {
      const a = get(p.move_id);
      a.picked++;
      if (typeof p.ms_since_shown === "number") a.ms.push(p.ms_since_shown);
      if (typeof p.position === "number" && p.position < 3) a.posPicked[p.position]++;
    } else if (e.name === "options_rejected") (p.move_ids as string[] | undefined)?.forEach((id) => get(id).rejected++);
  }
  return [...acc.entries()]
    .map(([id, a]) => {
      const m = meta.get(id);
      return {
        id, title: m?.title ?? id, source: m?.source ?? (id.startsWith("gen-") ? "generated" : "catalog"),
        step: m?.step ?? null, focus: m?.focus?.join("|") ?? "", cost: m?.cost ?? "",
        shown: a.shown, picked: a.picked, pickRate: a.shown ? Math.round((a.picked / a.shown) * 1000) / 1000 : 0,
        rejected: a.rejected, medianDecisionMs: median(a.ms),
        pickRatePos1: a.posShown[0] ? Math.round((a.posPicked[0] / a.posShown[0]) * 1000) / 1000 : null,
        pickRatePos2: a.posShown[1] ? Math.round((a.posPicked[1] / a.posShown[1]) * 1000) / 1000 : null,
        pickRatePos3: a.posShown[2] ? Math.round((a.posPicked[2] / a.posShown[2]) * 1000) / 1000 : null,
      };
    })
    .sort((a, b) => b.pickRate - a.pickRate || b.shown - a.shown || a.id.localeCompare(b.id));
}

export function rejectReasons(ev: EventRow[]) {
  const out: Record<string, Record<string, number>> = {};
  for (const e of ev) {
    if (e.name !== "options_rejected") continue;
    const step = String(e.step ?? "?");
    const reason = e.payload.reason_chip || (e.payload.text ? "other" : "none");
    out[step] ??= {};
    out[step][reason] = (out[step][reason] ?? 0) + 1;
  }
  return out;
}

export function classifierAccuracy(ev: EventRow[]) {
  const c = ev.filter((e) => e.name === "classification_confirmed");
  const kept = c.filter((e) => e.payload.changed === false).length;
  return { total: c.length, kept, pct: c.length ? Math.round((kept / c.length) * 100) : null };
}

export function feedback(ev: EventRow[], wishes: WishRow[]) {
  const wishText = new Map(wishes.map((w) => [w.id, w.text]));
  const by = (name: string) => ev.filter((e) => e.name === name);
  const useful: Record<string, Record<string, number>> = {};
  for (const e of by("options_feedback")) {
    const s = String(e.step ?? "?");
    (useful[s] ??= {})[e.payload.answer] = ((useful[s] ??= {})[e.payload.answer] ?? 0) + 1;
  }
  const paid: Record<string, Record<string, number>> = {};
  for (const e of by("paid_willingness")) {
    const id = e.payload.move_id ?? "?";
    (paid[id] ??= {})[e.payload.answer] = (paid[id][e.payload.answer] ?? 0) + 1;
  }
  return {
    avgRating: avg(by("path_rated").map((e) => Number(e.payload.rating)).filter((n) => !isNaN(n))),
    ratings: by("path_rated").length,
    wouldDoThisWeek: count(by("would_do_this_week").map((e) => String(e.payload.answer))),
    paidWillingness: paid,
    optionsUseful: useful,
    openText: by("open_feedback").filter((e) => e.payload.text).map((e) => ({ text: String(e.payload.text), wish: (e.wishId && wishText.get(e.wishId)) || "" })),
  };
}

/** Key numbers used for the side-by-side theme/provider comparisons. */
export function keyNumbers(ev: EventRow[]) {
  const f = funnel(ev);
  const fb = feedback(ev, []);
  const shown = ev.filter((e) => e.name === "options_shown");
  const fallbacks = ev.filter((e) => e.name === "provider_fallback").length;
  const lat = shown.map((e) => Number(e.payload.latency_ms)).filter((n) => !isNaN(n));
  const locked = ev.filter((e) => e.name === "move_locked").length;
  const rejected = ev.filter((e) => e.name === "options_rejected").length;
  return {
    sessions: f[0].n, completedRated: f[6].n,
    completionRate: f[0].n ? Math.round((f[6].n / f[0].n) * 100) : null,
    avgRating: fb.avgRating, wouldDoThisWeek: fb.wouldDoThisWeek,
    optionsUseful: count(ev.filter((e) => e.name === "options_feedback").map((e) => String(e.payload.answer))),
    medianLatencyMs: median(lat), fallbackRate: shown.length ? Math.round((fallbacks / shown.length) * 100) : null,
    rerollRate: locked + rejected ? Math.round((rejected / (locked + rejected)) * 100) : null,
    classifierAccuracyPct: classifierAccuracy(ev).pct,
  };
}

export function groupBy<T>(ev: EventRow[], key: (e: EventRow) => string, f: (ev: EventRow[]) => T) {
  const g = new Map<string, EventRow[]>();
  for (const e of ev) { const k = key(e); (g.get(k) ?? g.set(k, []).get(k)!).push(e); }
  return Object.fromEntries([...g.entries()].sort().map(([k, v]) => [k, f(v)]));
}

const t = (e: EventRow) => new Date(e.createdAt).getTime();

/** One row per decision (a set of shown options and its outcome). */
export function choicesRows(ev: EventRow[], wishes: WishRow[]) {
  const wm = new Map(wishes.map((w) => [w.id, w]));
  const sorted = [...ev].sort((a, b) => t(a) - t(b));
  const open = new Map<string, EventRow>();
  const rows: Record<string, unknown>[] = [];
  const base = (shown: EventRow) => {
    const w = shown.wishId ? wm.get(shown.wishId) : undefined;
    return {
      session: shown.sessionId, participant: shown.participantCode, theme: shown.theme, provider: shown.payload.used_provider ?? shown.provider,
      wish: w?.text ?? "", focus: w?.focus?.join("|") ?? "", domain: w?.domains?.join("|") ?? "", archetype: w?.archetype ?? "",
      step: shown.step, shown_ids: (shown.payload.move_ids as string[] | undefined)?.join("|") ?? "", reroll_index: shown.payload.reroll_index ?? 0,
    };
  };
  for (const e of sorted) {
    const k = `${e.sessionId}|${e.wishId}|${e.step}`;
    if (e.name === "options_shown") { open.set(k, e); continue; }
    const shown = open.get(k);
    if (!shown) continue;
    if (e.name === "move_locked")
      { rows.push({ ...base(shown), chosen_id: e.payload.move_id, chosen_position: e.payload.position, decision_ms: e.payload.ms_since_shown, reject_reason: "" }); open.delete(k); }
    else if (e.name === "options_rejected")
      { rows.push({ ...base(shown), chosen_id: "", chosen_position: "", decision_ms: "", reject_reason: [e.payload.reason_chip, e.payload.text].filter(Boolean).join(": ") }); open.delete(k); }
    else if (e.name === "step_skipped")
      { rows.push({ ...base(shown), chosen_id: "", chosen_position: "", decision_ms: "", reject_reason: "skipped" }); open.delete(k); }
  }
  return rows;
}

/** One row per completed path with all feedback fields. */
export function feedbackRows(ev: EventRow[], wishes: WishRow[]) {
  const wm = new Map(wishes.map((w) => [w.id, w]));
  const rows: Record<string, unknown>[] = [];
  for (const done of ev.filter((e) => e.name === "path_completed")) {
    const same = ev.filter((e) => e.sessionId === done.sessionId && e.wishId === done.wishId);
    const one = (n: string) => same.find((e) => e.name === n)?.payload;
    const w = done.wishId ? wm.get(done.wishId) : undefined;
    rows.push({
      session: done.sessionId, participant: done.participantCode, theme: done.theme, provider: done.provider,
      wish: w?.text ?? "", why: w?.why ?? "", archetype: w?.archetype ?? "", path: (done.payload.move_ids as string[] | undefined)?.join("|") ?? "",
      rating: one("path_rated")?.rating ?? "", would_do_this_week: one("would_do_this_week")?.answer ?? "",
      paid_willingness: same.filter((e) => e.name === "paid_willingness").map((e) => `${e.payload.move_id}:${e.payload.answer}`).join("|"),
      open_feedback: one("open_feedback")?.text ?? "",
    });
  }
  return rows;
}

export function eventsRows(ev: EventRow[]) {
  return ev.map((e) => ({
    id: e.id, created_at: new Date(e.createdAt).toISOString(), session_id: e.sessionId, wish_id: e.wishId, participant_code: e.participantCode,
    theme: e.theme, provider: e.provider, name: e.name, step: e.step, payload: JSON.stringify(e.payload),
  }));
}
