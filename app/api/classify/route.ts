import { NextResponse } from "next/server";
import { clientIp, limited, rules } from "@/lib/rate-limit";
import { readJson } from "@/lib/request";
import { currentSession } from "@/lib/session-auth";
import { z } from "zod";
import { config } from "@/lib/config";
import { classifyWish } from "@/lib/engine/classify";
import { buildClassifyPrompt, CLASSIFY_VERSION, classifyJsonSchema, parseClassify } from "@/lib/prompts/classify.v1";
import { runChain, LlmUnavailable } from "@/lib/providers/llm";

const body = z.object({ wishText: z.string().min(1).max(500) });

/**
 * Categorize a wish with the model chain. Classification only steers the moves, so if every model fails the
 * keyword classifier answers instead (source: "keywords") rather than blocking the student.
 */
export async function POST(req: Request) {
  const rl = limited([rules.classifyIp, clientIp(req)]);
  if (rl) return rl;
  const p = body.safeParse(await readJson(req, 4096));
  if (!p.success) return NextResponse.json({ ok: false, error: p.error.message }, { status: 400 });
  const session = await currentSession();
  if (!session) return NextResponse.json({ ok: false, reason: "no_session" }, { status: 401 });
  const s = limited([rules.optionsSession, session], [rules.classifyAll, "all"]);
  if (s) return s;
  const text = p.data.wishText;
  const t0 = Date.now();
  try {
    const r = await runChain({ schema: classifyJsonSchema, build: (hint) => buildClassifyPrompt(text, hint), parse: parseClassify }, { budgetMs: config.classifyBudgetMs });
    return NextResponse.json({
      ok: true, ...r.value, source: "llm", provider: r.backend.provider, model: r.backend.model, prompt_version: CLASSIFY_VERSION,
      latency_ms: r.latencyMs, tried: r.tried.map((t) => `${t.id}:${t.reason}`),
    });
  } catch (e) {
    console.error("classify failed, using keywords:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: true, ...keywords(text), source: "keywords", fail_reason: e instanceof LlmUnavailable ? e.reason : "error", latency_ms: Date.now() - t0 });
  }
}

function keywords(text: string) {
  const g = classifyWish(text);
  return { focus: g.focus, domains: g.domains, type: g.focus.includes("goal") ? "fixed" : "open_ended" };
}
