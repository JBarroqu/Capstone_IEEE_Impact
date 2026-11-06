import { describe, expect, it } from "vitest";
import { minutesLabel, pts } from "@/lib/format";

describe("format", () => {
  it("never formats a number as an empty string", () => {
    expect(pts(0)).toBe("0");
    expect(pts(22.8)).toBe("22.8");
    expect(pts(23.25)).toBe("23.25");
    expect(pts(10)).toBe("10");
    expect(pts(null)).toBe("");
  });
  it("labels minutes", () => {
    expect(minutesLabel(45)).toBe("45 min");
    expect(minutesLabel(90)).toBe("1.5 hr");
  });
});
