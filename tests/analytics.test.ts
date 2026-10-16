import { describe, it, expect } from "vitest";
import { leaderboard, funnel, rejectReasons, classifierAccuracy, choicesRows, feedbackRows, keyNumbers, journeys, type EventRow, type WishRow } from "@/lib/analytics";
import { toCsv } from "@/lib/csv";

let i = 0;
const ev = (name: string, payload: Record<string, any> = {}, o: Partial<EventRow> = {}): EventRow => ({
  createdAt: new Date(1_700_000_000_000 + i++ * 1000), sessionId: "s1", wishId: "w1", participantCode: "P01", provider: "gemini",
  name, step: 1, payload, ...o,
});
const wishes: WishRow[] = [{ id: "w1", sessionId: "s1", text: "Learn DevOps", type: "open_ended", focus: ["learn"], domains: ["technical"], archetype: "builder", why: "job" }];
const log = [
  ev("session_started", {}, { step: null }), ev("consent_given", {}, { step: null }), ev("wish_submitted", { text: "x" }, { step: null }),
  ev("options_shown", { move_ids: ["a", "b", "c"], reroll_index: 0 }),
  ev("options_rejected", { reason_chip: "too big", move_ids: ["a", "b", "c"] }),
  ev("options_shown", { move_ids: ["d", "b2", "c2"], reroll_index: 1 }),
  ev("move_locked", { move_id: "d", position: 0, ms_since_shown: 4000, reroll_index: 1 }),
  ev("classification_confirmed", { changed: false }, { step: null }),
  ev("path_completed", { move_ids: ["d"] }, { step: null }), ev("path_rated", { rating: 4 }, { step: null }),
  ev("would_do_this_week", { answer: "yes" }, { step: null }), ev("open_feedback", { text: "nice" }, { step: null }),
];

describe("analytics", () => {
  it("funnel counts distinct sessions", () => {
    const f = funnel(log);
    expect(f.map((x) => x.n)).toEqual([1, 1, 1, 1, 0, 0, 1]);
  });
  it("leaderboard computes pick rate and rejects", () => {
    const lb = leaderboard(log, new Map());
    const d = lb.find((r) => r.id === "d")!;
    expect(d).toMatchObject({ shown: 1, picked: 1, pickRate: 1, medianDecisionMs: 4000, pickRatePos1: 1 });
    expect(lb.find((r) => r.id === "a")).toMatchObject({ shown: 1, picked: 0, rejected: 1 });
  });
  it("reject reasons per step", () => expect(rejectReasons(log)).toEqual({ "1": { "too big": 1 } }));
  it("classifier accuracy", () => expect(classifierAccuracy(log)).toMatchObject({ total: 1, kept: 1, pct: 100 }));
  it("choices.csv rows: one per decision", () => {
    const rows = choicesRows(log, wishes);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ reject_reason: "too big", chosen_id: "" });
    expect(rows[1]).toMatchObject({ chosen_id: "d", chosen_position: 0, reroll_index: 1, wish: "Learn DevOps", archetype: "builder" });
  });
  it("feedback rows and key numbers", () => {
    expect(feedbackRows(log, wishes)[0]).toMatchObject({ rating: 4, would_do_this_week: "yes", open_feedback: "nice" });
    expect(keyNumbers(log)).toMatchObject({ sessions: 1, avgRating: 4, rerollRate: 50 });
  });
  it("csv escapes and adds BOM", () => {
    const c = toCsv([{ a: 'x,"y"', b: { k: 1 } }]);
    expect(c.startsWith("﻿")).toBe(true);
    expect(c).toContain('"x,""y"""');
    expect(c).toContain('"{""k"":1}"');
  });
});

describe("journeys", () => {
  it("groups each session's rounds per step with outcomes and feedback", () => {
    const [j] = journeys([...log, ev("options_feedback", { answer: "somewhat" }), ev("step_skipped", {}, { step: 2 }), ev("options_shown", { move_ids: ["x"] }, { step: 2 })], wishes);
    expect(j).toMatchObject({ sessionId: "s1", participant: "P01" });
    const w = j.wishes[0];
    expect(w).toMatchObject({ text: "Learn DevOps", archetype: "builder", classifierChanged: false, rating: 4, wouldDo: "yes", openFeedback: "nice", path: ["d"] });
    expect(w.steps[0].rounds.map((r) => r.outcome)).toEqual([
      { kind: "rejected", reason: "too big" },
      { kind: "picked", moveId: "d", position: 0, ms: 4000 },
    ]);
    expect(w.steps[0].useful).toBe("somewhat");
    expect(w.steps[1].rounds).toEqual([{ reroll: 0, moveIds: ["x"], outcome: { kind: "open" } }]);
  });
  it("separates sessions", () => {
    const js = journeys([ev("wish_submitted", {}, { sessionId: "a", wishId: "wa", step: null }), ev("wish_submitted", {}, { sessionId: "b", wishId: "wb", step: null })], []);
    expect(js.map((j) => j.sessionId)).toEqual(["b", "a"]);
  });
});

describe("event ordering", () => {
  it("orders a batch by client time when server times are equal", () => {
    const at = new Date(1_800_000_000_000);
    const c = (n: number) => new Date(1_800_000_000_000 + n);
    const batch = [
      ev("move_locked", { move_id: "a", position: 0 }, { createdAt: at, clientTs: c(2) }),
      ev("options_shown", { move_ids: ["a", "b", "c"] }, { createdAt: at, clientTs: c(1) }),
    ];
    expect(journeys(batch, wishes)[0].wishes[0].steps[0].rounds[0].outcome).toMatchObject({ kind: "picked", moveId: "a" });
    expect(choicesRows(batch, wishes)).toHaveLength(1);
  });
});
