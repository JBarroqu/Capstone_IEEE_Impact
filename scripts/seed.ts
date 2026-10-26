import { wishes } from "../lib/engine/wishes";

// Content lives in data/*.json (no DB rows needed). "Seeding" = validating the starter wishes; moves are all generated.
let bad = 0;
const ids = new Set<string>();
for (const w of wishes) {
  if (!w.id || !w.text?.trim()) { bad++; console.error("wish without id or text:", w); }
  if (ids.has(w.id)) { bad++; console.error(`duplicate wish id ${w.id}`); }
  ids.add(w.id);
}
console.log(`${wishes.length} wishes (${wishes.filter((w) => w.chip).length} chips), ${bad} problems`);
process.exit(bad ? 1 : 0);
