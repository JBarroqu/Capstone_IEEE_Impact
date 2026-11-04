import type { Domain, Focus, Move, OptionsMeta, OptionsRequest, PriorAttempts, QuestionSet, WishType } from "./types";
import { quiz } from "./archetypes";
import { apiUrl } from "./api";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const retryable = (status: number) => status === 0 || status === 429 || status >= 500;

/** POST with up to `tries` attempts on network errors, 429 and 5xx (backing off, honouring Retry-After). 4xx fails at once. */
export async function postRaw(url: string, body: unknown, tries = 3): Promise<Response> {
  for (let i = 1; ; i++) {
    // Locally the API is on another origin (same site, other port); credentials so the session and admin cookies go along.
    const res = await fetch(apiUrl(url), { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .catch(() => new Response(null, { status: 0 } as ResponseInit));
    if (res.ok || !retryable(res.status) || i >= tries) return res;
    const after = Number(res.headers.get("retry-after"));
    await sleep(after > 0 ? Math.min(after * 1000, 10_000) : 500 * 3 ** (i - 1));
  }
}

// Every call except /api/session waits for the session cookie, which the other routes require.
let sessionReady: Promise<unknown> = Promise.resolve();
export const whenSessionReady = () => sessionReady;

/** Creates the server session (and its signed cookie) right after consent, with retries. Later calls wait for it. */
export function startSession(body: { sessionId: string; participantCode: string; consented: true }) {
  sessionReady = postRaw("/api/session", body, 5).catch(() => {});
  return sessionReady;
}

export async function postJson(url: string, body: unknown, tries = 3): Promise<any> {
  await sessionReady;
  const res = await postRaw(url, body, tries);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

/** Fire and forget with retries; never blocks the UI. */
export function saveWish(body: Record<string, unknown>) {
  postJson("/api/wish", body, 4).catch(() => {});
}

export type OptionsResponse = { moves: Move[]; meta: OptionsMeta };
export type OptionsBody = Omit<OptionsRequest, "step"> & { step: number };
export class OptionsError extends Error {
  constructor(public reason: string) { super(`options failed: ${reason}`); }
}
export async function fetchOptions(body: unknown): Promise<OptionsResponse> {
  await sessionReady;
  // One try: the server already walks the model chain, and the student gets a retry button on failure.
  const res = await postRaw("/api/options", body, 1);
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.moves) throw new OptionsError(r.reason ?? "network");
  return { moves: r.moves, meta: r.meta };
}

type Classified = { wish: { focus: Focus[]; domains: Domain[]; type: WishType }; log: Record<string, unknown> };

/** Model classification of a wish. Never rejects: on a network error it returns an empty classification. */
export async function classify(wishText: string): Promise<Classified> {
  const r = await postJson("/api/classify", { wishText }).catch(() => null);
  if (!r?.ok) return { wish: { focus: [], domains: [], type: "open_ended" }, log: { focus: [], domains: [], type: "open_ended", source: "none", fail_reason: "network" } };
  const { ok: _, focus, domains, type, ...rest } = r;
  return { wish: { focus, domains, type }, log: { focus, domains, type, ...rest } };
}

type QuestionsBody = { wishText: string; type: WishType; focus: Focus[]; domains: Domain[]; why?: string; prior: PriorAttempts };

/** Follow-up questions for this wish. Never rejects: on a network error it returns the fixed quiz (source "fixed"). */
export async function fetchQuestions(body: QuestionsBody): Promise<QuestionSet> {
  const t0 = Date.now();
  const r = await postJson("/api/questions", body, 2).catch(() => null);
  if (r?.ok) { const { ok: _, ...set } = r; return set as QuestionSet; }
  return {
    source: "fixed", latencyMs: Date.now() - t0, failReason: "network",
    questions: quiz.map((q) => ({ id: q.id, prompt: q.prompt, note: "", answers: q.answers.map((a) => ({ id: a.id, label: a.label })) })),
  };
}
