/**
 * Where the FastAPI backend lives. Browser: NEXT_PUBLIC_API_URL, else the page's own host on port 8000 (so a LAN link
 * like http://192.168.x.x:3010 reaches http://192.168.x.x:8000 with no setup). Server (Next server components):
 * API_URL, else http://127.0.0.1:8000.
 */
export function apiUrl(path: string) {
  if (typeof window === "undefined") return `${process.env.API_URL ?? "http://127.0.0.1:8000"}${path}`;
  const base = process.env.NEXT_PUBLIC_API_URL || `${window.location.protocol}//${window.location.hostname}:${process.env.NEXT_PUBLIC_API_PORT || "8000"}`;
  return `${base}${path}`;
}
