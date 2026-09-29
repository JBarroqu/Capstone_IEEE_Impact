import type { Move, OptionsMeta, OptionsRequest } from "./types";

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
export async function fetchOptions(body: unknown): Promise<OptionsResponse> {
  const r = await postJson("/api/options", body);
  return { moves: r.moves, meta: r.meta };
}
