import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ accessToken: async () => "tok", supabase: { auth: { refreshSession: async () => ({}) } } }));

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("batches events with client ids and the user's token", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response("{}", { status: 200 }); }));
  const { track, flush } = await import("@/lib/track");
  track("wish_submitted", { text_length: 12 });
  track("options_shown", { move_ids: ["a"] }, 1);
  await flush();
  expect(calls).toHaveLength(1);
  const body = JSON.parse(String(calls[0].init.body));
  expect(body.events.map((e: { name: string }) => e.name)).toEqual(["wish_submitted", "options_shown"]);
  expect(body.events[0].id).toMatch(/^[0-9a-f-]{36}$/);
  expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer tok");
});
