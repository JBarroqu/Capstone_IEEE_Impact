import { NextResponse } from "next/server";
import { like, inArray } from "drizzle-orm";
import { isAdmin } from "@/lib/admin-auth";
import { getDb, schema } from "@/lib/db/client";

/** Deletes sessions (and their events, wishes, generated moves) whose participant code starts with TEST. */
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const db = getDb();
  const ids = (await db.select({ id: schema.sessions.id }).from(schema.sessions).where(like(schema.sessions.participantCode, "TEST%"))).map((r) => r.id);
  const evIds = (await db.select({ id: schema.events.sessionId }).from(schema.events).where(like(schema.events.participantCode, "TEST%"))).map((r) => r.id);
  const all = [...new Set([...ids, ...evIds])];
  if (all.length) {
    await db.delete(schema.events).where(inArray(schema.events.sessionId, all));
    await db.delete(schema.wishes).where(inArray(schema.wishes.sessionId, all));
    await db.delete(schema.generatedMoves).where(inArray(schema.generatedMoves.sessionId, all));
    await db.delete(schema.sessions).where(inArray(schema.sessions.id, all));
  }
  return NextResponse.json({ ok: true, deleted: all.length });
}
