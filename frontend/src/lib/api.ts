import { accessToken, supabase } from "./supabase";

/** Base for API calls: same origin by default (T-03), or VITE_API_BASE for a separate API host. */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: Record<string, unknown> = {}) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const retryable = (s: number) => s === 0 || s === 429 || s === 502 || s === 503 || s === 504;

/**
 * Fetch with the user's token. On 401 the session is refreshed once and the call retried. Network errors, 429 and 5xx
 * are retried with backoff (honouring Retry-After), like the Wish Engine's client. `tries` = total attempts.
 */
export async function api<T = any>(path: string, init: RequestInit & { json?: unknown; tries?: number } = {}): Promise<T> {
  const { json, tries = 2, ...rest } = init;
  let refreshed = false;
  for (let i = 1; ; i++) {
    const token = await accessToken();
    const headers = new Headers(rest.headers);
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (json !== undefined) headers.set("content-type", "application/json");
    const res = await fetch(`${API_BASE}${path}`, { ...rest, headers, body: json !== undefined ? JSON.stringify(json) : rest.body, credentials: "same-origin" })
      .catch(() => new Response(null, { status: 0 } as ResponseInit));
    if (res.status === 401 && token && !refreshed) {
      refreshed = true;
      await supabase.auth.refreshSession();
      continue;
    }
    if (res.ok) return (res.status === 204 ? {} : await res.json()) as T;
    if (retryable(res.status) && i < tries) {
      const after = Number(res.headers.get("retry-after"));
      await sleep(after > 0 ? Math.min(after * 1000, 10_000) : 500 * 3 ** (i - 1));
      continue;
    }
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { error?: string }).error ?? (res.status === 0 ? "Network error" : `Request failed (${res.status})`), body);
  }
}

export const get = <T = any>(p: string) => api<T>(p);
export const post = <T = any>(p: string, json?: unknown, tries = 1) => api<T>(p, { method: "POST", json: json ?? {}, tries });
export const put = <T = any>(p: string, json: unknown) => api<T>(p, { method: "PUT", json, tries: 1 });
export const upload = <T = any>(p: string, form: FormData) => api<T>(p, { method: "POST", body: form, tries: 1 });
