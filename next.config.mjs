import path from "node:path";

// Where the Next server reaches the API: API_URL, else API_HOSTPORT (Render's private-network address), else unset.
const apiOrigin = process.env.API_URL || (process.env.API_HOSTPORT ? `http://${process.env.API_HOSTPORT}` : "");
// Render: the browser calls /api on this app's own origin and Next forwards it to the private API service, so cookies
// stay first-party (onrender.com is a public suffix: app and api subdomains would be different sites). Read at build
// time, so API_HOSTPORT must be a build arg there. Behind Caddy (docker-compose.public.yml) Caddy routes /api instead.
const proxyApi = process.env.NEXT_PUBLIC_API_URL === "same-origin" && process.env.API_PROXY !== "off" && apiOrigin;
const publicMode = process.env.PUBLIC_MODE === "true";

/** @type {import('next').NextConfig} */
export default {
  // Self-contained server bundle, only for the Docker image (keeps `npm start` warning-free).
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
  // A stray package-lock.json in the home folder confuses Next's root detection.
  outputFileTracingRoot: path.resolve(import.meta.dirname),
  poweredByHeader: false,
  // Move generation can use the whole model budget (LLM_BUDGET_MS, 60 s); the proxy default is 30 s.
  experimental: { proxyTimeout: 90_000 },
  async rewrites() {
    return proxyApi ? [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }] : [];
  },
  // HSTS only in public mode: local and LAN runs use plain http.
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ...(publicMode ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
      ],
    }];
  },
};
