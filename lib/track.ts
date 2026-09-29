"use client";
import type { ClientEvent } from "./events";

type Ctx = { sessionId: string; participantCode: string; theme: string; wishId?: string | null };
let ctx: Ctx | null = null;
let queue: ClientEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let consented = false;

export function setTrackContext(c: Ctx) { ctx = c; }
export function setConsent(v: boolean) { consented = v; }

export function track(name: ClientEvent["name"], payload: Record<string, unknown> = {}, step?: number | null) {
  if (!ctx || !consented) return;
  queue.push({
    name, payload, step: step ?? null,
    clientTs: new Date().toISOString(),
    sessionId: ctx.sessionId, wishId: ctx.wishId ?? null,
    participantCode: ctx.participantCode, theme: ctx.theme,
  });
  if (!timer) timer = setTimeout(flush, 1500);
}

export function flush(useBeacon = false) {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  const body = JSON.stringify({ events: queue });
  queue = [];
  try {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* never block UI on logging */ }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => flush(true));
}
