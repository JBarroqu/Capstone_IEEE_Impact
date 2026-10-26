import { describe, it, expect } from "vitest";
import { signedToken } from "@/lib/secret";
import { toCsv } from "@/lib/csv";
import { Health, isDailyQuota, msUntilPacificMidnight } from "@/lib/providers/health";
import { readJson } from "@/lib/request";

describe("signedToken", () => {
  const s = "secret";
  it("round-trips and expires", () => {
    const t = signedToken.make(s, "abc", 1_000_000);
    expect(signedToken.verify(s, t, 60_000, 1_030_000)).toBe("abc");
    expect(signedToken.verify(s, t, 60_000, 1_070_000)).toBeNull();
  });
  it("rejects a changed payload, another secret, or garbage", () => {
    const t = signedToken.make(s, "abc");
    expect(signedToken.verify(s, t.replace("abc", "abd"), 60_000)).toBeNull();
    expect(signedToken.verify("other", t, 60_000)).toBeNull();
    expect(signedToken.verify(s, "nodots", 60_000)).toBeNull();
    expect(signedToken.verify(s, undefined, 60_000)).toBeNull();
  });
});

describe("toCsv", () => {
  it("defuses formulas in text but leaves numbers alone", () => {
    const csv = toCsv([{ a: "=HYPERLINK(\"x\")", b: -3, c: "@SUM(A1)", d: "fine" }]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(",-3,");
    expect(csv).toContain("'@SUM(A1)");
  });
});

describe("daily quota", () => {
  it("spots per-day 429s", () => {
    expect(isDailyQuota('429 RESOURCE_EXHAUSTED "quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"')).toBe(true);
    expect(isDailyQuota('429 "quotaId": "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"')).toBe(false);
  });
  it("waits until midnight Pacific", () => {
    // 2026-10-26 23:00 PDT = 2026-10-27 06:00 UTC: one hour left.
    expect(msUntilPacificMidnight(Date.UTC(2026, 9, 27, 6, 0, 0))).toBe(3_600_000);
  });
  it("Health honours an explicit cooldown", () => {
    let t = 0;
    const h = new Health(() => t);
    h.fail("m", "rate_limited", "daily", false, 5 * 3_600_000);
    t = 4 * 3_600_000;
    expect(h.cooling("m")).toBe(true);
    t = 5 * 3_600_000 + 1;
    expect(h.cooling("m")).toBe(false);
  });
});

describe("readJson", () => {
  const req = (body: string, headers: Record<string, string> = {}) => new Request("http://x", { method: "POST", body, headers });
  it("parses small bodies and refuses big or broken ones", async () => {
    expect(await readJson(req('{"a":1}'))).toEqual({ a: 1 });
    expect(await readJson(req(JSON.stringify({ a: "x".repeat(200) })), 100)).toBeNull();
    expect(await readJson(req("{", {}))).toBeNull();
  });
});
