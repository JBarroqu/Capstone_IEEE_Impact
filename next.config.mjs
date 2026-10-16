import path from "node:path";

/** @type {import('next').NextConfig} */
export default {
  // Self-contained server bundle for the Docker image (.next/standalone).
  output: "standalone",
  serverExternalPackages: ["postgres"],
  // A stray package-lock.json in the home folder confuses Next's root detection.
  outputFileTracingRoot: path.resolve(import.meta.dirname),
};
