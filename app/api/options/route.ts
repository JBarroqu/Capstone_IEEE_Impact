import { NextResponse } from "next/server";
import { clientIp, limited, rules } from "@/lib/rate-limit";
import { z } from "zod";
import { getOptions } from "@/lib/providers";
import { LlmUnavailable } from "@/lib/providers/llm";
import { ARCHETYPES, DOMAINS, FOCUSES, FORMATS } from "@/lib/types";

const move = z.object({
  id: z.string(), title: z.string(), detail: z.string(), step: z.number().int().min(1).max(5),
  focus: z.array(z.enum(FOCUSES)), domains: z.array(z.enum(DOMAINS)), minutes: z.number(), cost: z.enum(["free", "paid"]),
  format: z.enum(FORMATS), archetypeFit: z.record(z.string(), z.number()).default({}),
  tier: z.number().optional(), requires: z.array(z.string()).optional(),
});
const body = z.object({
  sessionId: z.string().uuid().optional(), wishId: z.string().uuid().optional(),
  step: z.number().int().min(1).max(5), rerollIndex: z.number().int().min(0).default(0),
  excludeIds: z.array(z.string()).default([]),
  rejectReason: z.object({ chip: z.string().optional(), text: z.string().max(500).optional() }).optional(),
  rejectedMoves: z.array(move).optional(),
  ctx: z.object({
    wishText: z.string().max(500), type: z.enum(["open_ended", "fixed"]),
    focus: z.array(z.enum(FOCUSES)), domains: z.array(z.enum(DOMAINS)),
    why: z.string().max(1000).optional(),
    prior: z.object({ chips: z.array(z.string()).max(10), text: z.string().max(1000).optional() }).default({ chips: [] }),
    archetype: z.enum(ARCHETYPES).optional(), chosen: z.array(move).default([]),
  }),
});

export async function POST(req: Request) {
  const ip = limited([rules.optionsIp, clientIp(req)]);
  if (ip) return ip;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: p.error.message }, { status: 400 });
  const s = limited([rules.optionsSession, p.data.sessionId]);
  if (s) return s;
  try {
    const result = await getOptions(p.data as never);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const reason = e instanceof LlmUnavailable ? e.reason : "error";
    console.error("options failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, reason }, { status: 503 });
  }
}
