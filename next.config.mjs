import path from "node:path";

/** @type {import('next').NextConfig} */
export default {
  // Self-contained server bundle, only for the Docker image (keeps `npm start` warning-free).
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
  // A stray package-lock.json in the home folder confuses Next's root detection.
  outputFileTracingRoot: path.resolve(import.meta.dirname),
};
