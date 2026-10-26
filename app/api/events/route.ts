import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db/client";
import { eventBatchSchema } from "@/lib/events";
import { config } from "@/lib/config";

/** Batches from lib/track.ts. Event ids come from the client, so a retried batch is not stored twice. */
export async function POST(req: Request) {
  let json: unknown;
  try { json = JSON.parse(await req.text()); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const parsed = eventBatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  try {
    const db = getDb();
    const rows = parsed.data.events.map((e) => ({
      ...(e.id ? { id: e.id } : {}),
      clientTs: e.clientTs ? new Date(e.clientTs) : null,
      sessionId: e.sessionId,
      wishId: e.wishId ?? null,
      participantCode: e.participantCode,
      appVersion: config.appVersion,
      provider: typeof e.payload.used_provider === "string" ? e.payload.used_provider : config.provider,
      name: e.name,
      step: e.step ?? null,
      payload: e.payload,
    }));
    if (rows.length) await db.insert(schema.events).values(rows).onConflictDoNothing();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("events insert failed", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
