import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";

const KEY = "signing_secret";
const g = globalThis as unknown as { _secret?: Promise<string> };

/**
 * Key for signing session and admin cookies: SESSION_SECRET if set, else a random one created on first use and kept
 * in the settings table, so cookies survive restarts without any setup.
 */
export function getSecret(): Promise<string> {
  if (process.env.SESSION_SECRET) return Promise.resolve(process.env.SESSION_SECRET);
  return (g._secret ??= (async () => {
    const { getDb, schema } = await import("./db/client");
    const db = getDb();
    await db.insert(schema.settings).values({ key: KEY, value: randomBytes(32).toString("hex") }).onConflictDoNothing();
    const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, KEY)).limit(1);
    return rows[0].value as string;
  })().catch((e) => { g._secret = undefined; throw e; }));
}

export const sign = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("base64url");

export function sameText(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** `payload.issuedAt.signature`; verify returns the payload if the signature matches and it is younger than maxAgeMs. */
export const signedToken = {
  make(secret: string, payload: string, now = Date.now()) {
    const body = `${payload}.${now.toString(36)}`;
    return `${body}.${sign(secret, body)}`;
  },
  verify(secret: string, token: string | undefined, maxAgeMs: number, now = Date.now()): string | null {
    if (!token) return null;
    const i = token.lastIndexOf(".");
    const body = token.slice(0, i), sig = token.slice(i + 1);
    if (i < 0 || !sameText(sig, sign(secret, body))) return null;
    const j = body.lastIndexOf(".");
    const at = parseInt(body.slice(j + 1), 36);
    if (j < 0 || !Number.isFinite(at) || at > now + 60_000 || now - at > maxAgeMs) return null;
    return body.slice(0, j);
  },
};
