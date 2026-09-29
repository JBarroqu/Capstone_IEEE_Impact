import { describe, it, expect } from "vitest";
import { classifyWish } from "@/lib/engine/classify";
import { staticGetOptions } from "@/lib/engine/select";
import { catalog, wishes } from "@/lib/engine/catalog";
import type { OptionsRequest, WishContext } from "@/lib/types";

const ctx = (o: Partial<WishContext> = {}): WishContext => ({
  wishText: "Connect in the healthcare industry", type: "open_ended",
  focus: ["connect"], domains: ["career", "leadership"], prior: { chips: [] }, chosen: [], ...o,
});
const req = (o: Partial<OptionsRequest> = {}): OptionsRequest => ({ ctx: ctx(), step: 1, excludeIds: [], rerollIndex: 0, ...o });

describe("classifyWish", () => {
  it("classifies example wishes", () => {
    expect(classifyWish("Connect in the healthcare industry").focus).toContain("connect");
    expect(classifyWish("A 4.0 GPA").domains).toContain("academic");
    expect(classifyWish("An impressive resume").domains).toContain("career");
    expect(classifyWish("Become an engineering manager").focus).toContain("lead");
    expect(classifyWish("Start a B2B SaaS").domains).toContain("venture");
  });
  it("returns no preselection for unknown text", () => {
    const c = classifyWish("zzz qqq");
    expect(c.domains).toEqual([]);
    expect(c.focus).toEqual([]);
  });
  it("handles every starter wish without throwing", () => {
    for (const w of wishes) expect(() => classifyWish(w.text)).not.toThrow();
  });
});

describe("staticGetOptions", () => {
  it("returns exactly 3 with ≥2 free and ≤1 paid at every step", () => {
    for (const step of [1, 2, 3, 4, 5] as const) {
      const { moves } = staticGetOptions(req({ step }));
      expect(moves).toHaveLength(3);
      expect(moves.filter((m) => m.cost === "free").length).toBeGreaterThanOrEqual(2);
      expect(moves.filter((m) => m.cost === "paid").length).toBeLessThanOrEqual(1);
    }
  });
  it("excludes moves already shown after a reroll", () => {
    const a = staticGetOptions(req());
    const b = staticGetOptions(req({ excludeIds: a.moves.map((m) => m.id), rerollIndex: 1 }));
    for (const m of b.moves) expect(a.moves.map((x) => x.id)).not.toContain(m.id);
  });
  it("relaxes filters when candidates run out and flags it", () => {
    const r = staticGetOptions(req({ ctx: ctx({ focus: ["lead"], domains: ["venture"] }), step: 3 }));
    expect(r.moves).toHaveLength(3);
    const shown = catalog.filter((m) => m.step === 3).map((m) => m.id);
    const r2 = staticGetOptions(req({ step: 3, excludeIds: shown.slice(0, shown.length - 1) }));
    expect(r2.meta.relaxed).toBe(true);
    expect(r2.moves).toHaveLength(3);
  });
  it("is deterministic", () => {
    expect(staticGetOptions(req()).moves.map((m) => m.id)).toEqual(staticGetOptions(req()).moves.map((m) => m.id));
  });
  it("does not offer paid moves after a 'don't want to pay' rejection", () => {
    const { moves } = staticGetOptions(req({ step: 3, rejectReason: { chip: "don't want to pay" } }));
    expect(moves.every((m) => m.cost === "free")).toBe(true);
  });
  it("never re-offers chosen moves", () => {
    const first = staticGetOptions(req()).moves[0];
    const { moves } = staticGetOptions(req({ step: 2, ctx: ctx({ chosen: [first] }) }));
    expect(moves.map((m) => m.id)).not.toContain(first.id);
  });
});
