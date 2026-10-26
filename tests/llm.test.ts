import { describe, it, expect, vi } from "vitest";
import { chainProvider, runChain, RateLimited, LlmUnavailable } from "@/lib/providers/llm";
import { rankGeminiModels, type Backend } from "@/lib/providers/backends";
import { Health } from "@/lib/providers/health";
import { parseClassify } from "@/lib/prompts/classify.v1";
import { getOptions, type Store } from "@/lib/providers";
import { genId } from "@/lib/providers/validate";
import { RateQueue, QueueTimeout } from "@/lib/providers/queue";
import type { OptionsRequest } from "@/lib/types";
import { buildPrompt, MOVES_TEMPERATURE } from "@/lib/prompts/moves.v3";

const req: OptionsRequest = {
  ctx: { wishText: "Pass technical interviews", type: "fixed", focus: ["goal"], domains: ["career"], prior: { chips: [] }, chosen: [] },
  step: 1, excludeIds: [], rerollIndex: 0,
};
const mv = (title: string, cost: "free" | "paid" = "free") => ({
  title, detail: "Do the specific thing today.", step: 1, focus: ["goal"], domains: ["career"], minutes: 30, cost, format: "solo",
});
const json = (...m: ReturnType<typeof mv>[]) => JSON.stringify({ moves: m });
type Gen = (signal: AbortSignal) => Promise<string>;
const backend = (id: string, gen: Gen): Backend => ({ id: `gemini:${id}`, provider: "gemini", model: id, remote: true, generate: (_, signal) => gen(signal) });
const chain = (backends: Backend[], opts: { timeoutMs?: number; budgetMs?: number; health?: Health } = {}) =>
  chainProvider({ backends: async () => backends, preferred: async () => null, health: opts.health ?? new Health(), timeoutMs: opts.timeoutMs ?? 500, budgetMs: opts.budgetMs ?? 5000 });
// One backend whose nth call returns gen(n).
const provider = (gen: (n: number) => Promise<string>, timeout = 500) => {
  let n = 0;
  return chain([backend("test-model", () => gen(n++))], { timeoutMs: timeout });
};
const hang: Gen = (signal) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(Object.assign(new Error("abort"), { name: "AbortError" }))));
const good = (p = "Ok") => json(mv(`${p} one`), mv(`${p} two`), mv(`${p} three`));

describe("LLM provider", () => {
  it("valid JSON path", async () => {
    const r = await provider(async () => json(mv("Do a timed mock"), mv("Drill graphs"), mv("Review DP notes"))).getOptions(req);
    expect(r.meta.usedProvider).toBe("gemini");
    expect(r.moves).toHaveLength(3);
    expect(r.moves.every((m) => m.id.startsWith("gen-"))).toBe(true);
    expect(r.meta.sources).toEqual(["generated", "generated", "generated"]);
    expect(r.meta.repaired).toBe(false);
  });
  it("malformed JSON → retry on the same model succeeds", async () => {
    const r = await provider(async (n) => (n === 0 ? "not json" : json(mv("A one"), mv("B two"), mv("C three")))).getOptions(req);
    expect(r.meta.usedProvider).toBe("gemini");
    expect(r.meta.repaired).toBe(true);
  });
  it("malformed JSON on every attempt → fails loudly, no static moves", async () => {
    const p = provider(async () => "nope");
    await expect(p.getOptions(req)).rejects.toMatchObject({ reason: "invalid_json" });
    await expect(p.getOptions(req)).rejects.toBeInstanceOf(LlmUnavailable);
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
  it("every model times out → LlmUnavailable(timeout)", async () => {
    const p = chain([backend("a", hang), backend("b", hang)], { timeoutMs: 30 });
    await expect(p.getOptions(req)).rejects.toMatchObject({ reason: "timeout" });
  });
  it("a hung model is skipped for the next one", async () => {
    const r = await chain([backend("slow", hang), backend("fast", async () => good("Next"))], { timeoutMs: 50 }).getOptions(req);
    expect(r.meta.model).toBe("fast");
    expect(r.meta.tried).toEqual(["gemini:slow:timeout"]);
  });
  it("503 on one model → next model answers, and the sick one is skipped on the next request", async () => {
    const health = new Health();
    let sick = 0;
    const p = chain([backend("busy", async () => { sick++; throw new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'); }), backend("ok", async () => good())], { health });
    expect((await p.getOptions(req)).meta.model).toBe("ok");
    expect((await p.getOptions(req)).meta.model).toBe("ok");
    expect(sick).toBe(1);
    expect(health.cooling("gemini:busy")).toBe(true);
  });
  it("rate limit (429) on every model → rate_limited", async () => {
    const p = chain([backend("a", async () => { throw new RateLimited("429"); }), backend("b", async () => { throw new RateLimited("429"); })]);
    await expect(p.getOptions(req)).rejects.toMatchObject({ reason: "rate_limited" });
  });
  it("retired model (404) or bad key moves on and is parked for hours", async () => {
    const health = new Health();
    const p = chain([backend("old", async () => { throw new Error("404 models/old is not found"); }), backend("ok", async () => good())], { health });
    expect((await p.getOptions(req)).meta.model).toBe("ok");
    expect(health.get("gemini:old").gone).toBe(true);
  });
  it("invalid output twice on one model → next model", async () => {
    const r = await chain([backend("bad", async () => "nope"), backend("ok", async () => good())]).getOptions(req);
    expect(r.meta.model).toBe("ok");
    expect(r.meta.tried).toEqual(["gemini:bad:invalid_json"]);
  });
  it("stops at the time budget even with models left", async () => {
    const p = chain([backend("a", hang), backend("b", hang), backend("c", hang)], { timeoutMs: 400, budgetMs: 600 });
    const t = Date.now();
    await expect(p.getOptions(req)).rejects.toBeInstanceOf(LlmUnavailable);
    expect(Date.now() - t).toBeLessThan(1500);
  });
  it("no models at all → fails loudly", async () => {
    await expect(chain([]).getOptions(req)).rejects.toBeInstanceOf(LlmUnavailable);
  });
  it("preferred model goes first; cooling ones go last", () => {
    const h = new Health();
    const bs = ["a", "b", "c"].map((id) => ({ id }));
    expect(h.order(bs, "c").map((b) => b.id)).toEqual(["c", "a", "b"]);
    h.fail("a", "error", "503");
    expect(h.order(bs, null).map((b) => b.id)).toEqual(["b", "c", "a"]);
  });
  it("id hashing is stable and normalized", () => {
    expect(genId("Do a Mock!", 1)).toBe(genId("do a  mock", 1));
    expect(genId("Do a mock", 1)).not.toBe(genId("Do a mock", 2));
  });
});

describe("no fixed moves + rate queue", () => {
  it("every identical request goes to the model (no cache)", async () => {
    const store: Store = { persistGenerated: async () => {} };
    const gen = vi.fn(async () => json(mv("One a"), mv("Two b"), mv("Three c")));
    const p = chain([backend("m", gen)]);
    await getOptions(req, { provider: p, store });
    const b = await getOptions(req, { provider: p, store });
    expect(gen).toHaveBeenCalledTimes(2);
    expect(b.meta.cacheHit).toBe(false);
  });
  it("prompt carries the style example but no ready-made moves for real wishes", () => {
    const { user, system } = buildPrompt({ ...req, ctx: { ...req.ctx, wishText: "Learn DevOps" } });
    expect(user).toContain("Style example");
    expect(`${system}\n${user}`).not.toMatch(/AWS|Azure|GCP|cloud lane|gold-standard|Worked path|Catalog/i);
  });
  it("titles already shown are listed in the prompt and dropped from the answer", async () => {
    const r = { ...req, excludeTitles: ["Two b"] };
    expect(buildPrompt(r).user).toContain("Two b");
    let n = 0;
    const out = await provider(async () => (n++ === 0 ? json(mv("One a"), mv("Two b"), mv("Three c")) : json(mv("One a"), mv("Four d"), mv("Three c")))).getOptions(r);
    expect(out.moves.map((m) => m.title)).not.toContain("Two b");
  });
  it("moves are generated at MOVES_TEMPERATURE", async () => {
    const seen: (number | undefined)[] = [];
    const b: Backend = { id: "gemini:t", provider: "gemini", model: "t", remote: true, generate: async (p) => { seen.push(p.temperature); return good(); } };
    await chain([b]).getOptions(req);
    expect(seen).toEqual([MOVES_TEMPERATURE]);
  });
  it("queue rejects when wait exceeds budget", async () => {
    const q = new RateQueue(1);
    await q.acquire(10);
    await expect(q.acquire(10)).rejects.toBeInstanceOf(QueueTimeout);
  });
});

describe("model discovery + classification", () => {
  it("ranks Gemini models: lite, flash, pro; stable before preview; newest first; drops non-text models", () => {
    expect(rankGeminiModels([
      "models/gemini-2.5-flash", "models/gemini-3.5-flash-lite", "models/gemini-3.1-flash-lite", "models/gemini-3.1-flash-lite-preview",
      "models/gemini-3.8-flash", "models/gemini-3.8-flash-tts", "models/gemini-3.1-flash-image", "models/gemini-flash-lite-latest",
      "models/gemini-2.5-pro", "models/gemma-3-27b-it", "models/text-embedding-004",
    ])).toEqual([
      "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.1-flash-lite-preview", "gemini-flash-lite-latest",
      "gemini-3.8-flash", "gemini-2.5-flash", "gemini-2.5-pro",
    ]);
  });
  it("classification goes through the chain and is validated", async () => {
    const r = await runChain(
      { schema: {}, build: () => ({ system: "", user: "" }), parse: parseClassify },
      { backends: async () => [backend("bad", async () => '{"focus":["nope"]}'), backend("ok", async () => '{"focus":["goal","goal"],"domains":["career"],"type":"fixed"}')], preferred: async () => null, health: new Health(), timeoutMs: 500, budgetMs: 5000 },
    );
    expect(r.value).toEqual({ focus: ["goal"], domains: ["career"], type: "fixed" });
    expect(r.backend.model).toBe("ok");
  });
});
