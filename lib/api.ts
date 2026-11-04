/** API_URL, else API_HOSTPORT (Render's private-network host:port for the API service), else the local default. */
export function serverApiOrigin() {
  return process.env.API_URL || (process.env.API_HOSTPORT ? `http://${process.env.API_HOSTPORT}` : "http://127.0.0.1:8000");
}

/**
 * Where the FastAPI backend lives. Browser: NEXT_PUBLIC_API_URL ("same-origin" when a proxy serves pages and /api on
 * one origin: Caddy in docker-compose.public.yml, or the Next rewrite on Render), else the page's own host on port 8000 (so a LAN link like
 * http://192.168.x.x:3010 reaches http://192.168.x.x:8000 with no setup). Server (Next server components): serverApiOrigin().
 */
export function apiUrl(path: string) {
  if (typeof window === "undefined") return `${serverApiOrigin()}${path}`;
  if (process.env.NEXT_PUBLIC_API_URL === "same-origin") return path;
  const base = process.env.NEXT_PUBLIC_API_URL || `${window.location.protocol}//${window.location.hostname}:${process.env.NEXT_PUBLIC_API_PORT || "8000"}`;
  return `${base}${path}`;
}
