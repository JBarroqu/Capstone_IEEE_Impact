import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { ARCHETYPES, DOMAINS, FOCUSES } from "@/lib/types";

const body = z.object({
  id: z.string().uuid(), sessionId: z.string().uuid(),
  text: z.string().min(1).max(500).optional(), fromChip: z.boolean().optional(),
  type: z.enum(["open_ended", "fixed"]).optional(),
  focus: z.array(z.enum(FOCUSES)).optional(), domains: z.array(z.enum(DOMAINS)).optional(),
  guessedFocus: z.array(z.enum(FOCUSES)).optional(), guessedDomains: z.array(z.enum(DOMAINS)).optional(),
  archetype: z.enum(ARCHETYPES).optional(), why: z.string().max(1000).optional(),
  priorAttempts: z.object({ chips: z.array(z.string()).max(10), text: z.string().max(1000).optional() }).optional(),
});

/** Upsert a wish; later screens send partial updates for the same id. */
export async function POST(req: Request) {
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: p.error.message }, { status: 400 });
  const { id, sessionId, ...rest } = p.data;
  const db = getDb();
  const existing = await db.select({ id: schema.wishes.id }).from(schema.wishes).where(eq(schema.wishes.id, id)).limit(1);
  if (existing.length) await db.update(schema.wishes).set(rest).where(eq(schema.wishes.id, id));
  else {
    if (!rest.text) return NextResponse.json({ ok: false, error: "text required" }, { status: 400 });
    await db.insert(schema.wishes).values({ id, sessionId, ...rest, text: rest.text });
  }
  return NextResponse.json({ ok: true });
}
