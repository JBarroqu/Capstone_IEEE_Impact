import type { Backend } from "./backends";
import { LlmUnavailable, RateLimited, Timeout, type FailReason } from "./errors";
import { Health } from "./health";
import { QueueTimeout } from "./queue";
import { ValidationError } from "./validate";

/** A prompt the chain can answer: build it (with a fix-up hint on retry), then parse/validate the text (throw ValidationError to retry). */
export type LlmTask<T> = { schema: object; build(hint?: string): { system: string; user: string }; parse(text: string): T };

export type Tried = { id: string; reason: FailReason };
export type RunResult<T> = { value: T; backend: Backend; latencyMs: number; tried: Tried[]; repaired: boolean };

export type RunOptions = {
  backends: Backend[];
  health: Health;
  preferred?: string | null;
  /** Per call. */
  timeoutMs: number;
  /** Whole request, across every backend. */
  budgetMs: number;
  /** Extra tries on the same backend when its output fails validation. */
  validationRetries?: number;
  /** Rate-limit wait per backend before moving on. */
  queueWaitMs?: number;
};

function classify(e: unknown): { reason: FailReason; gone: boolean; transient: boolean } {
  const msg = String((e as Error)?.message ?? e);
  if (e instanceof RateLimited || e instanceof QueueTimeout || /429|RESOURCE_EXHAUSTED/i.test(msg)) return { reason: "rate_limited", gone: false, transient: true };
  if ((e as Error)?.name === "AbortError" || (e as Error)?.name === "TimeoutError" || e instanceof Timeout) return { reason: "timeout", gone: false, transient: true };
  if (/\b(404|401|403)\b|NOT_FOUND|PERMISSION_DENIED|API key|not supported|no such model|model .*not found/i.test(msg)) return { reason: "error", gone: true, transient: false };
  return { reason: "error", gone: false, transient: true };
}

/**
 * Walk the backends in health order until one returns valid output. A failing backend is put on cooldown and the
 * next one is tried right away; the request only fails when every backend failed or the time budget ran out.
 */
export async function runLlm<T>(task: LlmTask<T>, o: RunOptions): Promise<RunResult<T>> {
  const t0 = Date.now();
  const left = () => o.budgetMs - (Date.now() - t0);
  const tried: Tried[] = [];
  let last: { reason: FailReason; detail: string } = { reason: "error", detail: o.backends.length ? "" : "no models available" };

  for (const b of o.health.order(o.backends, o.preferred)) {
    if (left() < 1000) { last = { reason: "timeout", detail: "time budget used up" }; break; }
    let hint: string | undefined;
    for (let attempt = 0; attempt <= (o.validationRetries ?? 1); attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), Math.min(o.timeoutMs, left()));
      const ts = Date.now();
      try {
        await b.acquire?.(Math.min(o.queueWaitMs ?? 3000, left()));
        const text = await b.generate({ ...task.build(hint), schema: task.schema }, ctrl.signal);
        const value = task.parse(text);
        o.health.ok(b.id, Date.now() - ts);
        return { value, backend: b, latencyMs: Date.now() - t0, tried, repaired: attempt > 0 };
      } catch (e) {
        const detail = String((e as Error)?.message ?? e).slice(0, 300);
        if (e instanceof ValidationError) {
          // The backend works but its answer was off: ask once more with the problem spelled out, then move on.
          hint = e.message; last = { reason: "invalid_json", detail };
          if (attempt < (o.validationRetries ?? 1) && left() > 1000) continue;
          tried.push({ id: b.id, reason: "invalid_json" });
          break;
        }
        const c = classify(e);
        last = { reason: c.reason, detail };
        tried.push({ id: b.id, reason: c.reason });
        // A full rate queue is local back-pressure, not a sick model: don't cool it down.
        if (!(e instanceof QueueTimeout)) o.health.fail(b.id, c.reason, detail, c.gone);
        break;
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw new LlmUnavailable(last.reason, `${last.detail}${tried.length ? ` (tried ${tried.map((t) => `${t.id}:${t.reason}`).join(", ")})` : ""}`);
}
