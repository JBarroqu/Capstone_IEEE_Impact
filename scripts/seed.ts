import { z } from "zod";
import { rawMoveSchema } from "../lib/providers/validate";
import { catalog, wishes } from "../lib/engine/catalog";

// The catalog lives in data/*.json (no DB rows needed). "Seeding" = validating the content files.
const moveSchema = rawMoveSchema.extend({ id: z.string().min(1), requires: z.array(z.string()).optional(), tier: z.number().optional() });
const ids = new Set(catalog.map((m) => m.id));
let bad = 0;
for (const m of catalog) {
  const r = moveSchema.safeParse(m);
  if (!r.success) { bad++; console.error(`invalid move ${m.id}:`, r.error.issues[0]); }
  if (m.title.length > 60) { bad++; console.error(`title too long: ${m.id}`); }
  for (const q of m.requires ?? []) if (!ids.has(q)) { bad++; console.error(`${m.id} requires unknown ${q}`); }
}
console.log(`catalog: ${catalog.length} moves, ${wishes.length} wishes, ${bad} problems`);
process.exit(bad ? 1 : 0);
