import { NextResponse } from "next/server";
import { inArray, sql, type SQL } from "drizzle-orm";
import { isAdmin } from "@/lib/admin-auth";
import { getDb, schema } from "@/lib/db/client";

/** Test codes are "TEST" in capitals followed by a space, dash or underscore ("TEST Waleed", "TEST-3"); "Tester" is not one. */
const TEST_CODE = "^TEST[ _-]";
const isTest = (col: typeof schema.sessions.participantCode | typeof schema.events.participantCode): SQL => sql`${col} ~ ${TEST_CODE}`;

async function testSessions() {
  const db = getDb();
  const rows = [
    ...(await db.select({ id: schema.sessions.id, code: schema.sessions.participantCode }).from(schema.sessions).where(isTest(schema.sessions.participantCode))),
    ...(await db.selectDistinct({ id: schema.events.sessionId, code: schema.events.participantCode }).from(schema.events).where(isTest(schema.events.participantCode))),
  ];
  return [...new Map(rows.map((r) => [r.id, r.code])).entries()].map(([id, code]) => ({ id, code }));
}

/** Preview: which sessions a delete would remove. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const s = await testSessions();
  return NextResponse.json({ ok: true, count: s.length, codes: [...new Set(s.map((x) => x.code))].sort() });
}

/** Deletes test sessions (and their events, wishes, generated moves). The client passes the count it previewed. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const { expect } = ((await req.json().catch(() => ({}))) ?? {}) as { expect?: number };
  const all = (await testSessions()).map((s) => s.id);
  // Something changed since the preview (a new test, or a code that now matches): make the admin look again.
  if (expect !== all.length) return NextResponse.json({ ok: false, reason: "changed", count: all.length }, { status: 409 });
  if (all.length) {
    const db = getDb();
    await db.transaction(async (tx) => {
      await tx.delete(schema.events).where(inArray(schema.events.sessionId, all));
      await tx.delete(schema.wishes).where(inArray(schema.wishes.sessionId, all));
      await tx.delete(schema.generatedMoves).where(inArray(schema.generatedMoves.sessionId, all));
      await tx.delete(schema.sessions).where(inArray(schema.sessions.id, all));
    });
  }
  return NextResponse.json({ ok: true, deleted: all.length });
}
