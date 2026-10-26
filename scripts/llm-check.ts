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
import { buildClassifyPrompt, classifyJsonSchema, parseClassify, type WishClass } from "../lib/prompts/classify.v1";
import { buildQuestionsPrompt, parseQuestions, QUESTIONS_TEMPERATURE, questionsJsonSchema } from "../lib/prompts/questions.v1";
import type { FollowUp } from "../lib/types";
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
  let cls: WishClass = { focus: ["advance"], domains: ["technical", "career"], type: "open_ended" };
  try {
    const c = await runChain(classifyTask);
    cls = c.value;
    console.log(`\nclassified by ${c.backend.id} in ${c.latencyMs}ms: ${JSON.stringify(c.value)}${c.tried.length ? ` (skipped ${c.tried.map((t) => `${t.id}:${t.reason}`).join(", ")})` : ""}`);
  } catch (e) {
    ok = false;
    console.log(`\nclassify FAILED: ${(e as Error).message}`);
  }

  // Follow-up questions, answered with the second option each time (as a stand-in student).
  const base = { wishText: wish, ...cls, why: "I want it to help me get a new-grad offer", prior: { chips: ["online course"] } };
  let followUps: FollowUp[] = [];
  try {
    const q = await runChain({ schema: questionsJsonSchema, temperature: QUESTIONS_TEMPERATURE, build: (h) => buildQuestionsPrompt(base, h), parse: parseQuestions });
    console.log(`\nquestions by ${q.backend.id} in ${q.latencyMs}ms:`);
    for (const x of q.value) console.log(`  ${x.prompt}\n    ${x.answers.map((a, i) => (i === 1 ? `[${a.label}]` : a.label)).join(" | ")}   (${x.note})`);
    followUps = q.value.map((x) => ({ question: x.prompt, answer: x.answers[1].label, note: x.note }));
  } catch (e) {
    ok = false;
    console.log(`\nquestions FAILED: ${(e as Error).message}`);
  }

  const req: OptionsRequest = {
    ctx: { ...base, followUps, chosen: [] },
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
