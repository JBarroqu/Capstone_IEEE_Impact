import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const g = globalThis as unknown as { _sql?: ReturnType<typeof postgres> };

export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  g._sql ??= postgres(process.env.DATABASE_URL, { max: 5, prepare: false });
  return drizzle(g._sql, { schema });
}
export { schema };
