import path from "node:path";

/** @type {import('next').NextConfig} */
export default {
  // Self-contained server bundle, only for the Docker image (keeps `npm start` warning-free).
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
  // A stray package-lock.json in the home folder confuses Next's root detection.
  outputFileTracingRoot: path.resolve(import.meta.dirname),
  poweredByHeader: false,
  // No HSTS here: local and LAN runs use plain http. The public proxy (Caddyfile.public) adds it.
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};
