import { describe, it, expect, vi } from "vitest";
import { makeLlmProvider, RateLimited } from "@/lib/providers/llm";
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
const provider = (gen: (n: number) => Promise<string>, timeout = 500) => {
  let n = 0;
  return makeLlmProvider("gemini", "test-model", () => gen(n++), timeout);
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
  it("malformed JSON twice → static fallback", async () => {
    const r = await provider(async () => "nope").getOptions(req);
    expect(r.meta.usedProvider).toBe("static");
    expect(r.meta.fallbackReason).toBe("invalid_json");
    expect(r.moves).toHaveLength(3);
  });
  it("2 paid → repaired to ≤1 paid and ≥2 free", async () => {
    const r = await provider(async () => json(mv("Paid one", "paid"), mv("Paid two", "paid"), mv("Free one"))).getOptions(req);
    expect(r.moves).toHaveLength(3);
    expect(r.moves.filter((m) => m.cost === "paid").length).toBeLessThanOrEqual(1);
    expect(r.moves.filter((m) => m.cost === "free").length).toBeGreaterThanOrEqual(2);
    expect(r.meta.repaired).toBe(true);
  });
  it("duplicate titles filtered and backfilled", async () => {
    const r = await provider(async () => json(mv("Same title"), mv("same  Title!"), mv("Other move"))).getOptions(req);
    const titles = r.moves.map((m) => m.title.toLowerCase().replace(/[^a-z ]/g, ""));
    expect(new Set(titles).size).toBe(3);
    expect(r.moves).toHaveLength(3);
  });
  it("truncates long titles and multi-sentence details", async () => {
    const long = { ...mv("x".repeat(90)), detail: "First sentence. Second sentence." };
    const r = await provider(async () => json(long, mv("Two"), mv("Three"))).getOptions(req);
    const g = r.moves.find((m) => m.id.startsWith("gen-") && m.title.startsWith("xxx"))!;
    expect(g.title.length).toBeLessThanOrEqual(60);
    expect(g.detail).toBe("First sentence.");
  });
  it("timeout → static fallback", async () => {
    const p = makeLlmProvider("gemini", "m", (_, signal) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(Object.assign(new Error("abort"), { name: "AbortError" })))), 50);
    const r = await p.getOptions(req);
    expect(r.meta.usedProvider).toBe("static");
    expect(r.meta.fallbackReason).toBe("timeout");
  });
  it("rate limit → static fallback", async () => {
    const r = await provider(async () => { throw new RateLimited("429"); }).getOptions(req);
    expect(r.meta.fallbackReason).toBe("rate_limited");
  });
  it("network error → static fallback", async () => {
    const r = await provider(async () => { throw new Error("ECONNREFUSED"); }).getOptions(req);
    expect(r.meta.usedProvider).toBe("static");
    expect(r.meta.fallbackReason).toBe("error");
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
    const p = makeLlmProvider("gemini", "m", gen, 500);
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
