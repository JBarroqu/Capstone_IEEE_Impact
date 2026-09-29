import { and, gte, lte, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./db/client";
import { catalog } from "./engine/catalog";
import type { EventRow, MoveMeta, WishRow } from "./analytics";

export type Filters = { from?: string; to?: string; participant?: string; provider?: string };

export function parseFilters(sp: URLSearchParams | Record<string, string | undefined>): Filters {
  const g = (k: string) => (sp instanceof URLSearchParams ? sp.get(k) : sp[k]) || undefined;
  return { from: g("from"), to: g("to"), participant: g("participant"), provider: g("provider") };
}

export async function loadData(f: Filters) {
  const db = getDb();
  const e = schema.events;
  const conds = [
    f.from && gte(e.createdAt, new Date(f.from)),
    f.to && lte(e.createdAt, new Date(new Date(f.to).getTime() + 86_400_000)),
    f.participant && eq(e.participantCode, f.participant),
    f.provider && eq(e.provider, f.provider),
  ].filter(Boolean) as ReturnType<typeof eq>[];
  const events = (await db.select().from(e).where(conds.length ? and(...conds) : undefined).orderBy(e.createdAt)) as unknown as EventRow[];

  const wishIds = [...new Set(events.map((x) => x.wishId).filter(Boolean))] as string[];
  const wishes = wishIds.length
    ? ((await db.select().from(schema.wishes).where(inArray(schema.wishes.id, wishIds))) as unknown as WishRow[])
    : [];

  const meta = new Map<string, MoveMeta>(
    catalog.map((m) => [m.id, { id: m.id, title: m.title, step: m.step, focus: m.focus, cost: m.cost, source: "catalog" as const }]),
  );
  const gen = await db.select().from(schema.generatedMoves);
  for (const g of gen) {
    const m = g.move as any;
    meta.set(g.id, { id: g.id, title: m.title, step: m.step, focus: m.focus, cost: m.cost, source: "generated" });
  }
  return { events, wishes, meta, generated: gen };
}
