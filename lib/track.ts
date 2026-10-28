"use client";
import type { ClientEvent } from "./events";
import { uuid } from "./uuid";
import { apiUrl } from "./api";

type Ctx = { sessionId: string; participantCode: string; wishId?: string | null };
let ctx: Ctx | null = null;
let queue: ClientEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let consented = false;
let failures = 0;

export function setTrackContext(c: Ctx) { ctx = c; }
export function setConsent(v: boolean) { consented = v; }

export function track(name: ClientEvent["name"], payload: Record<string, unknown> = {}, step?: number | null) {
  if (!ctx || !consented) return;
  queue.push({
    id: uuid(), name, payload, step: step ?? null,
    clientTs: new Date().toISOString(),
    sessionId: ctx.sessionId, wishId: ctx.wishId ?? null,
    participantCode: ctx.participantCode,
  });
  schedule(1500);
}

function schedule(ms: number) { if (!timer) timer = setTimeout(() => flush(), ms); }

/**
 * Sends up to 100 queued events. A failed batch goes back on the queue and is retried with backoff (2 s ... 60 s);
 * event ids make a retry of a batch the server did store harmless. On pagehide the queue goes out by sendBeacon.
 */
export function flush(useBeacon = false) {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  if (useBeacon && navigator.sendBeacon) {
    // text/plain: browsers refuse cross-origin beacons with a JSON content type. The API parses the body either way.
    while (queue.length) navigator.sendBeacon(apiUrl("/api/events"), new Blob([JSON.stringify({ events: queue.splice(0, 100) })], { type: "text/plain" }));
    return;
  }
  const batch = queue.splice(0, 100);
  const requeue = () => {
    queue = [...batch, ...queue].slice(-1000); // keep the newest 1000 if the server stays down
    failures++;
    schedule(Math.min(60_000, 2000 * 2 ** (failures - 1)));
  };
  // text/plain keeps this a "simple" request (no CORS preflight), which keepalive needs to survive page close.
  fetch(apiUrl("/api/events"), { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ events: batch }), keepalive: true })
    .then((res) => {
      // 4xx (other than 429) will not get better by retrying; drop the batch rather than loop.
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) { failures = 0; if (queue.length) schedule(0); }
      else requeue();
    })
    .catch(requeue);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => flush(true));
}
