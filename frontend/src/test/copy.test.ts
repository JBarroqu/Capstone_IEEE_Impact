/* Copy rules (docs/DESIGN.md): no emoji, never "AI" or "smart" in the interface. Checks string literals and JSX text. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? (f === "test" ? [] : files(p)) : p.endsWith(".tsx") ? [p] : [];
  });
}

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

it("UI copy has no emoji and never says AI or smart", () => {
  const bad: string[] = [];
  for (const f of files(join(__dirname, ".."))) {
    const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const texts = [...src.matchAll(/>([^<>{}]+)</g), ...src.matchAll(/"([^"]{3,})"/g)].map((m) => m[1]);
    for (const t of texts) {
      if (EMOJI.test(t) || /\bAI\b/.test(t) || /\bsmart\b/i.test(t)) bad.push(`${f}: ${t.trim()}`);
    }
  }
  expect(bad).toEqual([]);
});
