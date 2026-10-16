import type { Domain, Focus, Move, OptionsMeta, OptionsRequest, WishType } from "./types";

export async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

/** Fire and forget; never blocks the UI. */
export function saveWish(body: Record<string, unknown>) {
  postJson("/api/wish", body).catch(() => {});
}

export type OptionsResponse = { moves: Move[]; meta: OptionsMeta };
export type OptionsBody = Omit<OptionsRequest, "step"> & { step: number };
export class OptionsError extends Error {
  constructor(public reason: string) { super(`options failed: ${reason}`); }
}
export async function fetchOptions(body: unknown): Promise<OptionsResponse> {
  const res = await fetch("/api/options", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.moves) throw new OptionsError(r.reason ?? "network");
  return { moves: r.moves, meta: r.meta };
}

type Classified = { wish: { focus: Focus[]; domains: Domain[]; type: WishType }; log: Record<string, unknown> };

/** Model classification of a wish. Never rejects: on a network error it returns an empty classification. */
export async function classify(wishText: string): Promise<Classified> {
  const r = await postJson("/api/classify", { wishText }).catch(() => null);
  if (!r?.ok) return { wish: { focus: [], domains: [], type: "open_ended" }, log: { focus: [], domains: [], type: "open_ended", source: "none", fail_reason: "network" } };
  const { ok: _, focus, domains, type, ...rest } = r;
  return { wish: { focus, domains, type }, log: { focus, domains, type, ...rest } };
}
