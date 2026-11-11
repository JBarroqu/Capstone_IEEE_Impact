import { API_BASE, post } from "./api";
import { accessToken } from "./supabase";
import { uuid } from "./uuid";

/**
 * Analytics events (from the Wish Engine's track.ts). Batched every 1.5 s, retried with backoff; event ids make a
 * retried batch harmless. Normal sends carry the user's token; on page close sendBeacon can't, so it carries a signed
 * ticket from /api/v1/events/ticket instead (T-13). Payload keys stay snake_case: admin analytics depends on them.
 */
export const EVENT_NAMES = [
  "session_started", "consent_given", "wish_submitted", "classification_guessed", "classification_confirmed",
  "why_submitted", "prior_attempts_submitted", "quiz_answered", "archetype_assigned", "options_shown",
  "provider_fallback", "option_selected", "option_deselected", "move_locked", "options_rejected",
  "step_skipped", "options_feedback", "path_completed", "path_rated", "would_do_this_week",
  "paid_willingness", "open_feedback", "start_over", "session_abandoned", "options_relaxed", "options_failed", "quiz_skipped",
  "questions_shown", "evidence_submitted", "buddy_invited", "feedback_given", "page_view",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

type Ev = { id: string; name: EventName; payload: Record<string, unknown>; step: number | null; clientTs: string; clientSessionId: string; wishId: string | null };
const clientSessionId = uuid();
let queue: Ev[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
let ticket: { value: string; at: number } | null = null;

export function track(name: EventName, payload: Record<string, unknown> = {}, step?: number | null, wishId?: string | null) {
  queue.push({ id: uuid(), name, payload, step: step ?? null, clientTs: new Date().toISOString(), clientSessionId, wishId: wishId ?? null });
  schedule(1500);
}

function schedule(ms: number) { if (!timer) timer = setTimeout(() => void flush(), ms); }

export async function refreshTicket() {
  if (!(await accessToken())) return;
  try {
    const r = await post<{ ticket: string }>("/api/v1/events/ticket");
    ticket = { value: r.ticket, at: Date.now() };
  } catch { /* beacons fall back to nothing */ }
}

export async function flush(useBeacon = false) {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  if (useBeacon && navigator.sendBeacon) {
    if (!ticket) return;
    while (queue.length) navigator.sendBeacon(`${API_BASE}/api/v1/events`, new Blob([JSON.stringify({ events: queue.splice(0, 100), ticket: ticket.value })], { type: "text/plain" }));
    return;
  }
  const batch = queue.splice(0, 100);
  try {
    const token = await accessToken();
    const res = await fetch(`${API_BASE}/api/v1/events`, {
      method: "POST", keepalive: true,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ events: batch }),
    });
    if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) { failures = 0; if (queue.length) schedule(0); return; }
    throw new Error(String(res.status));
  } catch {
    queue = [...batch, ...queue].slice(-1000);
    failures++;
    schedule(Math.min(60_000, 2000 * 2 ** (failures - 1)));
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => void flush(true));
  setInterval(() => { if (!ticket || Date.now() - ticket.at > 3_600_000) void refreshTicket(); }, 600_000);
}
