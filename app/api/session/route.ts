import { NextResponse } from "next/server";
import { clientIp, limited, rules } from "@/lib/rate-limit";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { config } from "@/lib/config";

const body = z.object({
  sessionId: z.string().uuid(), participantCode: z.string().max(64), consented: z.boolean(),
});

/** Called only after consent. Creates the session row. */
export async function POST(req: Request) {
  const rl = limited([rules.sessionIp, clientIp(req)]);
  if (rl) return rl;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success || !p.data.consented) return NextResponse.json({ ok: false }, { status: 400 });
  await getDb().insert(schema.sessions).values({
    id: p.data.sessionId, participantCode: p.data.participantCode, provider: config.provider,
    appVersion: config.appVersion, consented: true,
  }).onConflictDoNothing();
  return NextResponse.json({ ok: true, provider: config.provider });
}
