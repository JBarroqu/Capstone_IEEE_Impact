import { describe, it, expect, vi, afterEach } from "vitest";
import { uuid } from "@/lib/uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuid", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("uses crypto.randomUUID when available", () => expect(uuid()).toMatch(V4));
  it("falls back to a valid v4 when randomUUID is missing (http LAN URLs)", () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; } });
    const a = uuid(), b = uuid();
    expect(a).toMatch(V4);
    expect(a).not.toBe(b);
  });
  it("falls back even with no crypto at all", () => {
    vi.stubGlobal("crypto", undefined);
    expect(uuid()).toMatch(V4);
  });
});
