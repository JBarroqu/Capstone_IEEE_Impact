import { NextResponse } from "next/server";
import { config } from "./config";

/**
 * In-memory token buckets, one per (rule, key). Fine for the single app process this runs as (dev server or one
 * Docker container); several replicas would each keep their own counts, so move this to Postgres/Redis before scaling out.
 */
export type Rule = { name: string; limit: number; windowMs: number };

type Bucket = { tokens: number; at: number };

export class RateLimiter {
  private m = new Map<string, Bucket>();
  constructor(private now = () => Date.now(), private maxKeys = 50_000) {}

  /** Takes one token. `retryAfterMs` is how long until the next token when refused. */
  take(rule: Rule, key: string): { ok: boolean; retryAfterMs: number } {
    const id = `${rule.name}:${key}`, now = this.now(), rate = rule.limit / rule.windowMs;
    const b = this.m.get(id) ?? { tokens: rule.limit, at: now };
    b.tokens = Math.min(rule.limit, b.tokens + (now - b.at) * rate);
    b.at = now;
    this.m.delete(id);
    this.m.set(id, b); // re-insert so Map order is least-recently-used first
    if (this.m.size > this.maxKeys) this.m.delete(this.m.keys().next().value!);
    if (b.tokens >= 1) { b.tokens -= 1; return { ok: true, retryAfterMs: 0 }; }
    return { ok: false, retryAfterMs: Math.ceil((1 - b.tokens) / rate) };
  }
}

const MIN = 60_000;

/**
 * Per-IP limits are loose because a lab of students can share one campus NAT address; per-session limits do the
 * real work where the body carries a sessionId. Login is strict to slow password guessing.
 */
export const rules = {
  optionsSession: { name: "options:s", limit: 20, windowMs: MIN },
  optionsIp: { name: "options:ip", limit: 120, windowMs: MIN },
  classifyIp: { name: "classify:ip", limit: 60, windowMs: MIN },
  eventsSession: { name: "events:s", limit: 60, windowMs: MIN },
  eventsIp: { name: "events:ip", limit: 600, windowMs: MIN },
  writeIp: { name: "write:ip", limit: 300, windowMs: MIN },
  sessionIp: { name: "session:ip", limit: 30, windowMs: MIN },
  loginIp: { name: "login:ip", limit: 10, windowMs: 15 * MIN },
  adminModelsIp: { name: "admin-models:ip", limit: 6, windowMs: MIN },
} satisfies Record<string, Rule>;

const g = globalThis as unknown as { _rateLimiter?: RateLimiter };
export const limiter = (g._rateLimiter ??= new RateLimiter());

/**
 * First X-Forwarded-For hop, else X-Real-IP. Only trustworthy behind a proxy that overwrites these headers; when the
 * app is reached directly a client can send its own, which is why per-session limits back the IP ones up.
 */
export function clientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Returns a 429 response if any (rule, key) pair is over its limit, else null. Keys that are undefined are skipped. */
export function limited(...checks: [Rule, string | undefined][]): NextResponse | null {
  if (!config.rateLimit) return null;
  for (const [rule, key] of checks) {
    if (!key) continue;
    const r = limiter.take(rule, key);
    if (!r.ok) {
      const secs = Math.max(1, Math.ceil(r.retryAfterMs / 1000));
      return NextResponse.json({ ok: false, reason: "rate_limited", retry_after_s: secs }, { status: 429, headers: { "retry-after": String(secs) } });
    }
  }
  return null;
}
