import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db/client";
import { eventBatchSchema } from "@/lib/events";
import { config } from "@/lib/config";

export async function POST(req: Request) {
  let json: unknown;
  try { json = JSON.parse(await req.text()); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const parsed = eventBatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  try {
    const db = getDb();
    const rows = parsed.data.events.map((e) => ({
      clientTs: e.clientTs ? new Date(e.clientTs) : null,
      sessionId: e.sessionId,
      wishId: e.wishId ?? null,
      participantCode: e.participantCode,
      theme: e.theme,
      appVersion: config.appVersion,
      provider: typeof e.payload.used_provider === "string" ? e.payload.used_provider : config.provider,
      name: e.name,
      step: e.step ?? null,
      payload: e.payload,
    }));
    if (rows.length) await db.insert(schema.events).values(rows);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("events insert failed", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
