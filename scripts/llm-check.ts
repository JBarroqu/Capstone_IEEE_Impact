import "dotenv/config";
import { getProvider } from "../lib/providers";
import { config } from "../lib/config";
import { rawMoveSchema } from "../lib/providers/validate";
import type { OptionsRequest } from "../lib/types";

const req: OptionsRequest = {
  ctx: {
    wishText: process.argv[2] ?? "Turn my capstone into a portfolio piece",
    type: "open_ended", focus: ["advance"], domains: ["technical", "career"],
    why: "I want it to help me get a new-grad offer", prior: { chips: ["online course"] },
    archetype: "builder", chosen: [],
  },
  step: 1, excludeIds: [], rerollIndex: 0,
};

async function main() {
  console.log(`provider=${config.provider} model=${config.provider === "ollama" ? config.ollamaModel : config.geminiModel}`);
  const r = await getProvider().getOptions(req);
  r.moves.forEach((m, i) => console.log(`${i + 1}. [${m.cost}, ${m.minutes}m, ${m.format}] ${m.title}\n   ${m.detail}`));
  const valid = r.moves.length === 3 && r.moves.every((m) => rawMoveSchema.safeParse(m).success);
  const free = r.moves.filter((m) => m.cost === "free").length;
  console.log(`\nused=${r.meta.usedProvider} latency=${r.meta.latencyMs}ms repaired=${r.meta.repaired} fallback=${r.meta.fallbackReason ?? "none"}`);
  if (r.meta.errorDetail) console.log(`error: ${r.meta.errorDetail}`);
  console.log(`validation: ${valid && free >= 2 && r.meta.usedProvider === config.provider ? "PASS" : "FAIL (or fell back to static)"} (moves=${r.moves.length}, free=${free})`);
  process.exit(valid && r.meta.usedProvider === config.provider ? 0 : 1);
}
main();
