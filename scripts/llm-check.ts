/**
 * Usage: npm run llm:check ["wish text"] [--all]
 * Prints the model chain, then classifies the wish and generates move 1 through it (as the app does).
 * --all also pings every model on its own, so you can see which ones are up right now.
 */
import "dotenv/config";
import { getProvider } from "../lib/providers";
import { getBackends } from "../lib/providers/backends";
import { runChain } from "../lib/providers/llm";
import { Health } from "../lib/providers/health";
import { config } from "../lib/config";
import { rawMoveSchema } from "../lib/providers/validate";
import { buildClassifyPrompt, classifyJsonSchema, parseClassify } from "../lib/prompts/classify.v1";
import type { OptionsRequest } from "../lib/types";

const args = process.argv.slice(2);
const all = args.includes("--all");
const wish = args.find((a) => !a.startsWith("--")) ?? "Turn my capstone into a portfolio piece";
const classifyTask = { schema: classifyJsonSchema, build: (h?: string) => buildClassifyPrompt(wish, h), parse: parseClassify };

async function main() {
  const backends = await getBackends();
  console.log(`MOVE_PROVIDER=${config.provider}; chain (${backends.length}):`);
  backends.forEach((b, i) => console.log(`  ${i + 1}. ${b.id}`));
  if (!backends.length) { console.log("No models available. Set GEMINI_API_KEY, GROQ_API_KEY or OPENROUTER_API_KEY, or start Ollama."); process.exit(1); }

  if (all) {
    console.log("\nPinging each model (classification prompt):");
    for (const b of backends) {
      const t = Date.now();
      try {
        const r = await runChain(classifyTask, { backends: async () => [b], preferred: async () => null, health: new Health(), budgetMs: config.llmTimeoutMs });
        console.log(`  OK    ${b.id} ${Date.now() - t}ms ${JSON.stringify(r.value)}`);
      } catch (e) {
        console.log(`  FAIL  ${b.id} ${Date.now() - t}ms ${(e as Error).message.slice(0, 140)}`);
      }
    }
  }

  let ok = true;
  try {
    const c = await runChain(classifyTask);
    console.log(`\nclassified by ${c.backend.id} in ${c.latencyMs}ms: ${JSON.stringify(c.value)}${c.tried.length ? ` (skipped ${c.tried.map((t) => `${t.id}:${t.reason}`).join(", ")})` : ""}`);
  } catch (e) {
    ok = false;
    console.log(`\nclassify FAILED: ${(e as Error).message}`);
  }

  const req: OptionsRequest = {
    ctx: { wishText: wish, type: "open_ended", focus: ["advance"], domains: ["technical", "career"], why: "I want it to help me get a new-grad offer", prior: { chips: ["online course"] }, archetype: "builder", chosen: [] },
    step: 1, excludeIds: [], rerollIndex: 0,
  };
  try {
    const r = await getProvider().getOptions(req);
    console.log("");
    r.moves.forEach((m, i) => console.log(`${i + 1}. [${m.cost}, ${m.minutes}m, ${m.format}] ${m.title}\n   ${m.detail}`));
    const valid = r.moves.length === 3 && r.moves.every((m) => rawMoveSchema.safeParse(m).success);
    console.log(`\nmoves by ${r.meta.usedProvider}:${r.meta.model} in ${r.meta.latencyMs}ms repaired=${r.meta.repaired}${r.meta.tried?.length ? ` skipped=${r.meta.tried.join(", ")}` : ""}`);
    console.log(`validation: ${valid ? "PASS" : "FAIL"}`);
    ok &&= valid;
  } catch (e) {
    ok = false;
    console.log(`\nmoves FAILED: ${(e as Error).message}`);
  }
  process.exit(ok ? 0 : 1);
}
main();
