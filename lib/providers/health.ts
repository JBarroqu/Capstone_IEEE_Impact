import type { FailReason } from "./errors";

export type HealthEntry = {
  coolUntil: number; fails: number; gone: boolean;
  lastOkAt?: number; lastLatencyMs?: number; lastError?: string; lastErrorAt?: number;
};

const MIN = 60_000;

/** Per-backend circuit breaker: failing backends are skipped for a while so students don't wait on them. */
export class Health {
  private m = new Map<string, HealthEntry>();
  constructor(private now = () => Date.now()) {}

  get(id: string): HealthEntry {
    return this.m.get(id) ?? this.m.set(id, { coolUntil: 0, fails: 0, gone: false }).get(id)!;
  }
  ok(id: string, latencyMs: number) {
    const e = this.get(id);
    Object.assign(e, { coolUntil: 0, fails: 0, gone: false, lastOkAt: this.now(), lastLatencyMs: latencyMs });
  }
  /** `gone`: model missing or key rejected; skip for hours. Otherwise back off 1, 2, 4 ... 10 min (rate limits: 30 s). */
  fail(id: string, reason: FailReason, detail: string, gone = false) {
    const e = this.get(id);
    e.fails++;
    e.gone = gone;
    e.lastError = `${reason}: ${detail}`.slice(0, 200);
    e.lastErrorAt = this.now();
    const ms = gone ? 6 * 60 * MIN : reason === "rate_limited" ? 30_000 : Math.min(10 * MIN, MIN * 2 ** (e.fails - 1));
    e.coolUntil = this.now() + ms;
  }
  cooling(id: string) { return this.get(id).coolUntil > this.now(); }

  /** Healthy backends first (preferred one at the front, else config order); then cooling ones, soonest-recovering first. Gone ones last. */
  order<T extends { id: string }>(backends: T[], preferred?: string | null): T[] {
    const idx = (b: T) => (b.id === preferred ? -1 : backends.indexOf(b));
    const healthy = backends.filter((b) => !this.cooling(b.id)).sort((a, b) => idx(a) - idx(b));
    const cool = backends.filter((b) => this.cooling(b.id));
    const rank = (b: T) => (this.get(b.id).gone ? Infinity : this.get(b.id).coolUntil);
    return [...healthy, ...cool.sort((a, b) => rank(a) - rank(b))];
  }
  snapshot() { return Object.fromEntries(this.m); }
}

const g = globalThis as unknown as { _health?: Health };
/** Shared across route handlers and the admin page in one server process. */
export const health = (g._health ??= new Health());
