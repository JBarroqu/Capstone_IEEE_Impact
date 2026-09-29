import { describe, it, expect, vi } from "vitest";
import { makeLlmProvider, RateLimited, LlmUnavailable } from "@/lib/providers/llm";
import { getOptions, type Store } from "@/lib/providers";
import { genId } from "@/lib/providers/validate";
import { RateQueue, QueueTimeout } from "@/lib/providers/queue";
import type { OptionsRequest } from "@/lib/types";

const req: OptionsRequest = {
  ctx: { wishText: "Pass technical interviews", type: "fixed", focus: ["goal"], domains: ["career"], prior: { chips: [] }, chosen: [] },
  step: 1, excludeIds: [], rerollIndex: 0,
};
const mv = (title: string, cost: "free" | "paid" = "free") => ({
  title, detail: "Do the specific thing today.", step: 1, focus: ["goal"], domains: ["career"], minutes: 30, cost, format: "solo",
});
const json = (...m: ReturnType<typeof mv>[]) => JSON.stringify({ moves: m });
const fast = { backoffMs: 0 };
const provider = (gen: (n: number) => Promise<string>, timeout = 500, opts = {}) => {
  let n = 0;
  return makeLlmProvider("gemini", "test-model", () => gen(n++), timeout, undefined, { ...fast, ...opts });
};

describe("LLM provider", () => {
  it("valid JSON path", async () => {
    const r = await provider(async () => json(mv("Do a timed mock"), mv("Drill graphs"), mv("Review DP notes"))).getOptions(req);
    expect(r.meta.usedProvider).toBe("gemini");
    expect(r.moves).toHaveLength(3);
    expect(r.moves.every((m) => m.id.startsWith("gen-"))).toBe(true);
    expect(r.meta.sources).toEqual(["generated", "generated", "generated"]);
    expect(r.meta.repaired).toBe(false);
  });
  it("malformed JSON → retry succeeds", async () => {
    const r = await provider(async (n) => (n === 0 ? "not json" : json(mv("A one"), mv("B two"), mv("C three")))).getOptions(req);
    expect(r.meta.usedProvider).toBe("gemini");
    expect(r.meta.repaired).toBe(true);
  });
  it("malformed JSON on every attempt → fails loudly, no static moves", async () => {
    const p = provider(async () => "nope");
    await expect(p.getOptions(req)).rejects.toMatchObject({ reason: "invalid_json" });
    await expect(p.getOptions(req)).rejects.toBeInstanceOf(LlmUnavailable);
  });
  it("same failure with LLM_FALLBACK=static → catalog moves, flagged as static", async () => {
    const r = await provider(async () => "nope", 500, { fallback: "static" }).getOptions(req);
    expect(r.meta.usedProvider).toBe("static");
    expect(r.meta.fallbackReason).toBe("invalid_json");
    expect(r.moves).toHaveLength(3);
  });
  it("2 paid → too few usable moves → retried with a hint until valid", async () => {
    let n = 0;
    const r = await provider(async () => (n++ === 0 ? json(mv("Paid one", "paid"), mv("Paid two", "paid"), mv("Free one")) : json(mv("Free a"), mv("Free b"), mv("Paid c", "paid")))).getOptions(req);
    expect(n).toBe(2);
    expect(r.moves.filter((m) => m.cost === "paid").length).toBeLessThanOrEqual(1);
    expect(r.moves.filter((m) => m.cost === "free").length).toBeGreaterThanOrEqual(2);
    expect(r.meta.repaired).toBe(true);
    expect(r.moves.every((m) => m.id.startsWith("gen-"))).toBe(true);
  });
  it("duplicate titles are filtered and the model is asked again", async () => {
    let n = 0;
    const r = await provider(async () => (n++ === 0 ? json(mv("Same title"), mv("same  Title!"), mv("Other move")) : json(mv("Fresh a"), mv("Fresh b"), mv("Fresh c")))).getOptions(req);
    expect(r.moves).toHaveLength(3);
    expect(new Set(r.moves.map((m) => m.title.toLowerCase().replace(/[^a-z ]/g, ""))).size).toBe(3);
  });
  it("truncates long titles and multi-sentence details", async () => {
    const long = { ...mv("x".repeat(90)), detail: "First sentence. Second sentence." };
    const r = await provider(async () => json(long, mv("Two"), mv("Three"))).getOptions(req);
    const g = r.moves.find((m) => m.title.startsWith("xxx"))!;
    expect(g.title.length).toBeLessThanOrEqual(60);
    expect(g.detail).toBe("First sentence.");
  });
  it("every attempt times out → LlmUnavailable(timeout)", async () => {
    const p = makeLlmProvider("gemini", "m", (_, signal) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(Object.assign(new Error("abort"), { name: "AbortError" })))), 30, undefined, { ...fast, attempts: 2 });
    await expect(p.getOptions(req)).rejects.toMatchObject({ reason: "timeout" });
  });
  it("a hung first attempt is retried and succeeds", async () => {
    let n = 0;
    const p = makeLlmProvider("gemini", "m", (_, signal) => n++ === 0
      ? new Promise((_, rej) => signal.addEventListener("abort", () => rej(Object.assign(new Error("abort"), { name: "AbortError" }))))
      : Promise.resolve(json(mv("Retry one"), mv("Retry two"), mv("Retry three"))), 50, undefined, fast);
    const r = await p.getOptions(req);
    expect(r.meta.usedProvider).toBe("gemini");
    expect(n).toBe(2);
  });
  it("transient 503s are retried up to the attempt limit", async () => {
    let n = 0;
    const r = await provider(async () => { if (n++ < 2) throw new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'); return json(mv("Ok one"), mv("Ok two"), mv("Ok three")); }).getOptions(req);
    expect(n).toBe(3);
    expect(r.meta.usedProvider).toBe("gemini");
  });
  it("rate limit (429) is retried too, then fails as rate_limited", async () => {
    let n = 0;
    const p = provider(async () => { n++; throw new RateLimited("429"); }, 500, { attempts: 2 });
    await expect(p.getOptions(req)).rejects.toMatchObject({ reason: "rate_limited" });
    expect(n).toBe(2);
  });
  it("non-transient error fails immediately without retrying", async () => {
    let n = 0;
    await expect(provider(async () => { n++; throw new Error("API key not valid"); }).getOptions(req)).rejects.toBeInstanceOf(LlmUnavailable);
    expect(n).toBe(1);
  });
  it("id hashing is stable and normalized", () => {
    expect(genId("Do a Mock!", 1)).toBe(genId("do a  mock", 1));
    expect(genId("Do a mock", 1)).not.toBe(genId("Do a mock", 2));
  });
});

describe("cache + rate queue", () => {
  it("second identical request is a cache hit", async () => {
    const mem = new Map<string, unknown>();
    const store: Store = {
      cacheGet: async (k) => (mem.get(k) as never) ?? null,
      cacheSet: async (k, m) => { mem.set(k, m); },
      persistGenerated: async () => {},
    };
    const gen = vi.fn(async () => json(mv("One a"), mv("Two b"), mv("Three c")));
    const p = makeLlmProvider("gemini", "m", gen, 500, undefined, fast);
    const a = await getOptions(req, { provider: p, store, cache: true });
    await new Promise((r) => setTimeout(r, 10));
    const b = await getOptions(req, { provider: p, store, cache: true });
    expect(gen).toHaveBeenCalledTimes(1);
    expect(b.meta.cacheHit).toBe(true);
    expect(b.moves.map((m) => m.id)).toEqual(a.moves.map((m) => m.id));
  });
  it("queue rejects when wait exceeds budget", async () => {
    const q = new RateQueue(1);
    await q.acquire(10);
    await expect(q.acquire(10)).rejects.toBeInstanceOf(QueueTimeout);
  });
});
