import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/csv";
import { Health, isDailyQuota, msUntilPacificMidnight } from "@/lib/providers/health";

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
