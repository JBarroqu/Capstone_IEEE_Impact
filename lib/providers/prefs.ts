import { eq } from "drizzle-orm";

const KEY = "preferred_backend";
const g = globalThis as unknown as { _pref?: { at: number; v: string | null } };

/** Backend id the admin chose to try first (null = automatic order). Cached 30 s; survives restarts via the settings table. */
export async function getPreferredBackend(): Promise<string | null> {
  if (g._pref && Date.now() - g._pref.at < 30_000) return g._pref.v;
  const { getDb, schema } = await import("../db/client");
  const rows = await getDb().select().from(schema.settings).where(eq(schema.settings.key, KEY)).limit(1);
  const v = (rows[0]?.value as string | null) ?? null;
  g._pref = { at: Date.now(), v };
  return v;
}

export async function setPreferredBackend(id: string | null) {
  const { getDb, schema } = await import("../db/client");
  await getDb().insert(schema.settings).values({ key: KEY, value: id }).onConflictDoUpdate({ target: schema.settings.key, set: { value: id, updatedAt: new Date() } });
  g._pref = { at: Date.now(), v: id };
}
