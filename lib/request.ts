/** Parsed JSON body, or null if it is missing, malformed or over maxBytes (checked before and after reading). */
export async function readJson(req: Request, maxBytes = 16_384): Promise<unknown> {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) return null;
  const text = await req.text().catch(() => "");
  if (!text || Buffer.byteLength(text) > maxBytes) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/** Behind Caddy (docker compose) the original scheme arrives in X-Forwarded-Proto. */
export const isHttps = (req: Request) => (req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")) === "https";

/** True when the browser is on this machine (localhost URL), so plain http never crosses the network. */
export function isLocal(req: Request) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host).replace(/:\d+$/, "");
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(host);
}
