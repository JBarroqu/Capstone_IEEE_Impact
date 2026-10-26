import { NextResponse } from "next/server";
import { clientIp, limited, rules } from "@/lib/rate-limit";
import { readJson } from "@/lib/request";
import { currentSession } from "@/lib/session-auth";
import { z } from "zod";
import { getOptions } from "@/lib/providers";
import { LlmUnavailable } from "@/lib/providers/llm";
import { ARCHETYPES, DOMAINS, FOCUSES, FORMATS } from "@/lib/types";

// Moves come back from the client (chosen, rejected), so every field is capped: they end up in the prompt.
const move = z.object({
  id: z.string().max(80), title: z.string().max(200), detail: z.string().max(600), step: z.number().int().min(1).max(5),
  focus: z.array(z.enum(FOCUSES)).max(10), domains: z.array(z.enum(DOMAINS)).max(10), minutes: z.number().min(0).max(10_000), cost: z.enum(["free", "paid"]),
  format: z.enum(FORMATS), archetypeFit: z.record(z.string().max(20), z.number()).default({}),
  tier: z.number().optional(), requires: z.array(z.string().max(80)).max(10).optional(),
});
const body = z.object({
  sessionId: z.string().uuid().optional(), wishId: z.string().uuid().optional(),
  step: z.number().int().min(1).max(5), rerollIndex: z.number().int().min(0).default(0),
  excludeIds: z.array(z.string().max(80)).max(100).default([]),
  excludeTitles: z.array(z.string().max(200)).max(30).optional(),
  rejectReason: z.object({ chip: z.string().max(60).optional(), text: z.string().max(500).optional() }).optional(),
  rejectedMoves: z.array(move).max(3).optional(),
  ctx: z.object({
    wishText: z.string().max(500), type: z.enum(["open_ended", "fixed"]),
    focus: z.array(z.enum(FOCUSES)).max(10), domains: z.array(z.enum(DOMAINS)).max(10),
    why: z.string().max(1000).optional(),
    prior: z.object({ chips: z.array(z.string().max(40)).max(10), text: z.string().max(1000).optional() }).default({ chips: [] }),
    archetype: z.enum(ARCHETYPES).optional(), chosen: z.array(move).max(5).default([]),
  }),
});

export async function POST(req: Request) {
  const ip = limited([rules.optionsIp, clientIp(req)]);
  if (ip) return ip;
  const p = body.safeParse(await readJson(req, 32_768));
  if (!p.success) return NextResponse.json({ ok: false, error: p.error.message }, { status: 400 });
  // Model calls only for a session that went through consent; the session comes from the signed cookie, not the body.
  const session = await currentSession();
  if (!session || (p.data.sessionId && p.data.sessionId !== session)) return NextResponse.json({ ok: false, reason: "no_session" }, { status: 401 });
  const s = limited([rules.optionsSession, session], [rules.optionsAll, "all"]);
  if (s) return s;
  try {
    const result = await getOptions({ ...p.data, sessionId: session } as never);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const reason = e instanceof LlmUnavailable ? e.reason : "error";
    console.error("options failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, reason }, { status: 503 });
  }
}
