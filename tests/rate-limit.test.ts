import { describe, it, expect } from "vitest";
import { RateLimiter, clientIp, type Rule } from "@/lib/rate-limit";

const rule: Rule = { name: "t", limit: 3, windowMs: 60_000 };

describe("RateLimiter", () => {
  it("allows a burst up to the limit, then refuses with a retry time", () => {
    let t = 0;
    const l = new RateLimiter(() => t);
    expect([1, 2, 3].map(() => l.take(rule, "a").ok)).toEqual([true, true, true]);
    const r = l.take(rule, "a");
    expect(r.ok).toBe(false);
    expect(r.retryAfterMs).toBe(20_000);
  });
  it("refills over time and keeps keys separate", () => {
    let t = 0;
    const l = new RateLimiter(() => t);
    for (let i = 0; i < 3; i++) l.take(rule, "a");
    expect(l.take(rule, "b").ok).toBe(true);
    t = 20_000;
    expect(l.take(rule, "a").ok).toBe(true);
    expect(l.take(rule, "a").ok).toBe(false);
  });
  it("evicts the least recently used key past maxKeys", () => {
    const l = new RateLimiter(() => 0, 2);
    for (let i = 0; i < 3; i++) l.take(rule, "a");
    l.take(rule, "b");
    l.take(rule, "c"); // evicts "a", which starts fresh
    expect(l.take(rule, "a").ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("uses the first X-Forwarded-For hop, then X-Real-IP", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } }))).toBe("1.2.3.4");
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "5.6.7.8" } }))).toBe("5.6.7.8");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});
