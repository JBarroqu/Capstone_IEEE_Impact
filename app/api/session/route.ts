import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { config } from "@/lib/config";
import { clientIp, limited, rules } from "@/lib/rate-limit";
import { readJson } from "@/lib/request";
import { issueSession } from "@/lib/session-auth";

const body = z.object({
  sessionId: z.string().uuid(), participantCode: z.string().trim().min(1).max(64), consented: z.literal(true),
});

/** Called only after consent. Creates the session row and the signed cookie the other routes check. */
export async function POST(req: Request) {
  const rl = limited([rules.sessionIp, clientIp(req)], [rules.sessionAll, "all"]);
  if (rl) return rl;
  const p = body.safeParse(await readJson(req, 1024));
  if (!p.success) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    await getDb().insert(schema.sessions).values({
      id: p.data.sessionId, participantCode: p.data.participantCode, provider: config.provider,
      appVersion: config.appVersion, consented: true,
    }).onConflictDoNothing();
    const res = NextResponse.json({ ok: true, provider: config.provider });
    await issueSession(res, req, p.data.sessionId);
    return res;
  } catch (e) {
    console.error("session insert failed", e);
    return NextResponse.json({ ok: false, reason: "db" }, { status: 503 });
  }
}
