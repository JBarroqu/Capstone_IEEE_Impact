import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { ARCHETYPES, DOMAINS, FOCUSES } from "@/lib/types";

const body = z.object({
  id: z.string().uuid(), sessionId: z.string().uuid(),
  text: z.string().min(1).max(500).optional(), fromChip: z.boolean().optional(),
  type: z.enum(["open_ended", "fixed"]).optional(),
  focus: z.array(z.enum(FOCUSES)).max(10).optional(), domains: z.array(z.enum(DOMAINS)).max(10).optional(),
  guessedFocus: z.array(z.enum(FOCUSES)).max(10).optional(), guessedDomains: z.array(z.enum(DOMAINS)).max(10).optional(),
  archetype: z.enum(ARCHETYPES).optional(), why: z.string().max(1000).optional(),
  priorAttempts: z.object({ chips: z.array(z.string().max(40)).max(10), text: z.string().max(1000).optional() }).optional(),
  followUps: z.array(z.object({ question: z.string().max(200), answer: z.string().max(80), note: z.string().max(200).optional() })).max(5).optional(),
});

/** Upsert a wish; later screens send partial updates for the same id. */
export async function POST(req: Request) {
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: p.error.message }, { status: 400 });
  const { id, sessionId, ...rest } = p.data;
  try {
    // True upsert: client updates for one wish can arrive out of order, so insert-or-update in one statement.
    await getDb()
      .insert(schema.wishes)
      .values({ id, sessionId, ...rest, text: rest.text ?? "" })
      .onConflictDoUpdate({ target: schema.wishes.id, set: rest });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("wish upsert failed", e);
    return NextResponse.json({ ok: false, reason: "db" }, { status: 503 });
  }
}
