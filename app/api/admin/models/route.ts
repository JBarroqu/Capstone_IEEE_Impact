import { NextResponse } from "next/server";
import { clientIp, limited, rules } from "@/lib/rate-limit";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-auth";
import { getBackends } from "@/lib/providers/backends";
import { health } from "@/lib/providers/health";
import { runChain } from "@/lib/providers/llm";
import { setPreferredBackend } from "@/lib/providers/prefs";
import { buildClassifyPrompt, classifyJsonSchema, parseClassify } from "@/lib/prompts/classify.v1";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prefer"), id: z.string().nullable() }),
  z.object({ action: z.literal("test") }),
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("clear-cache") }),
]);

/** Admin model controls: choose which model to try first, ping every model, or re-list available models. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const rl = limited([rules.adminModelsIp, clientIp(req)]);
  if (rl) return rl;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: p.error.message }, { status: 400 });
  const a = p.data;

  if (a.action === "prefer") { await setPreferredBackend(a.id); return NextResponse.json({ ok: true }); }
  // Cached moves are replayed to anyone who sends the same wish and answers; clearing drops a bad or off-topic set.
  if (a.action === "clear-cache") {
    const { getDb, schema } = await import("@/lib/db/client");
    const n = (await getDb().delete(schema.llmCache).returning({ key: schema.llmCache.key })).length;
    return NextResponse.json({ ok: true, cleared: n });
  }
  if (a.action === "refresh") return NextResponse.json({ ok: true, count: (await getBackends(true)).length });

  // test: one small classification call per model, updating the shared health so the chain reacts right away.
  const task = { schema: classifyJsonSchema, build: (h?: string) => buildClassifyPrompt("Land a new-grad SWE offer", h), parse: parseClassify };
  const results = [];
  for (const b of await getBackends()) {
    const t = Date.now();
    try {
      await runChain(task, { backends: async () => [b], preferred: async () => null, budgetMs: 15_000 });
      results.push({ id: b.id, ok: true, ms: Date.now() - t });
    } catch (e) {
      results.push({ id: b.id, ok: false, ms: Date.now() - t, error: String((e as Error).message).slice(0, 160) });
    }
  }
  return NextResponse.json({ ok: true, results, health: health.snapshot() });
}
