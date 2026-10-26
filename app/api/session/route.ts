import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { config } from "@/lib/config";

const body = z.object({
  sessionId: z.string().uuid(), participantCode: z.string().trim().min(1).max(64), consented: z.literal(true),
});

/** Called only after consent. Creates the session row. */
export async function POST(req: Request) {
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    await getDb().insert(schema.sessions).values({
      id: p.data.sessionId, participantCode: p.data.participantCode, provider: config.provider,
      appVersion: config.appVersion, consented: true,
    }).onConflictDoNothing();
    return NextResponse.json({ ok: true, provider: config.provider });
  } catch (e) {
    console.error("session insert failed", e);
    return NextResponse.json({ ok: false, reason: "db" }, { status: 503 });
  }
}
