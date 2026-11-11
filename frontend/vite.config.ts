import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

// The API serves this build on the same origin in production (T-03). In development Vite proxies /api to it.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: path.resolve(here, ".."),
  resolve: { alias: { "@": path.resolve(here, "src") } },
  server: { port: 5173, proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: false } } },
  preview: { port: 4173, proxy: { "/api": { target: "http://127.0.0.1:8000" } } },
  test: {
    environment: "jsdom", setupFiles: ["./src/test/setup.ts"], css: false,
    // Fixed placeholders so unit tests never depend on anyone's .env.local (CI and fresh clones have none).
    env: { VITE_SUPABASE_URL: "http://127.0.0.1:54321", VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" },
  },
});
