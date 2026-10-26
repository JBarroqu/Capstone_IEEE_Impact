import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db/client";
import { eventBatchSchema } from "@/lib/events";
import { config } from "@/lib/config";
import { clientIp, limited, rules } from "@/lib/rate-limit";
import { readJson } from "@/lib/request";
import { currentSession } from "@/lib/session-auth";

/** Batches from lib/track.ts. 64 KB is far above a real batch (100 events of a few hundred bytes). */
export async function POST(req: Request) {
  const ip = limited([rules.eventsIp, clientIp(req)]);
  if (ip) return ip;
  const json = await readJson(req, 65_536);
  if (json === null) return NextResponse.json({ ok: false }, { status: 400 });
  const parsed = eventBatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  const session = await currentSession();
  if (!session || parsed.data.events.some((e) => e.sessionId !== session)) return NextResponse.json({ ok: false, reason: "no_session" }, { status: 401 });
  const s = limited([rules.eventsSession, session]);
  if (s) return s;
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
