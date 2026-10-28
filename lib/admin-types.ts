import type { Move } from "./types";

/** Shapes returned by the FastAPI admin dashboard (GET /api/admin/dashboard); see backend/wish_api/analytics.py. */
/** source "catalog" only appears on rows logged before moves.v3, when a hand-written catalog still existed. */
export type MoveMeta = Pick<Move, "id" | "title" | "step" | "focus" | "cost"> & { source: "catalog" | "generated" };
export type Round = {
  reroll: number; moveIds: string[];
  outcome: { kind: "picked"; moveId: string; position: number | null; ms: number | null } | { kind: "rejected"; reason: string } | { kind: "skipped" } | { kind: "open" };
};
export type WishJourney = {
  wishId: string | null; text: string; why: string; archetype: string; focus: string[]; domains: string[]; classifierChanged: boolean | null;
  /** Follow-up questions shown for this wish and the answer to each (null = not answered). Null for rows before questions_shown existed. */
  questions: { source: string; skipped: boolean; items: { question: string; answer: string | null }[] } | null;
  steps: { step: number; rounds: Round[]; failed: number; useful: string | null }[];
  path: string[] | null; rating: number | null; wouldDo: string | null; paid: { moveId: string; answer: string }[]; openFeedback: string | null;
};
export type Journey = { sessionId: string; participant: string; provider: string | null; started: Date; lastSeen: Date; wishes: WishJourney[] };

export type LeaderRow = {
  id: string; title: string; source: string; step: number | null; focus: string; cost: string; shown: number; picked: number; pickRate: number;
  rejected: number; medianDecisionMs: number | null; pickRatePos1: number | null; pickRatePos2: number | null; pickRatePos3: number | null;
};
export type KeyNumbers = {
  sessions: number; completedRated: number; completionRate: number | null; avgRating: number | null; wouldDoThisWeek: Record<string, number>;
  optionsUseful: Record<string, number>; medianLatencyMs: number | null; failedRate: number | null; fallbackRate: number | null;
  rerollRate: number | null; classifierAccuracyPct: number | null;
};
export type Dashboard = {
  eventCount: number; wishCount: number;
  sessions: { id: string; participant: string }[];
  journeys: (Omit<Journey, "started" | "lastSeen"> & { started: string; lastSeen: string })[];
  meta: Record<string, MoveMeta>;
  generated: Record<string, Record<string, unknown>>;
  models: { rows: { id: string; status: "ok" | "untested" | "cooling" | "gone"; note: string }[]; preferred: string | null };
  usage: Record<string, { n: number; median: number | null; failover: number }>;
  classSrc: Record<string, number>;
  failedLoads: number;
  funnel: { label: string; n: number }[];
  leaderboard: LeaderRow[];
  rejectReasons: Record<string, Record<string, number>>;
  feedback: {
    avgRating: number | null; ratings: number; wouldDoThisWeek: Record<string, number>; paidWillingness: Record<string, Record<string, number>>;
    optionsUseful: Record<string, Record<string, number>>; openText: { text: string; wish: string }[];
  };
  byProvider: Record<string, KeyNumbers>;
  wishTallies: { area: Record<string, number>; focus: Record<string, number>; finish: Record<string, number>; archetype: Record<string, number> };
};
