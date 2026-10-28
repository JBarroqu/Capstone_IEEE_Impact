import { apiUrl } from "./api";

export type ServerConfig = { flowMoves: 1 | 3; consent: { intro: string; data: string } };

/** Settings that live in the API's env (flow length, consent text naming the outside model services). Server-only. */
export async function getServerConfig(): Promise<ServerConfig | null> {
  const res = await fetch(apiUrl("/api/config"), { cache: "no-store" }).catch(() => null);
  return res?.ok ? ((await res.json()) as ServerConfig) : null;
}
