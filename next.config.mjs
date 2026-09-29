import path from "node:path";

/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: ["postgres"],
  // A stray package-lock.json in the home folder confuses Next's root detection.
  outputFileTracingRoot: path.resolve(import.meta.dirname),
};
