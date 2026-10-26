import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { getSecret, signedToken } from "./secret";
import { isHttps } from "./request";

export const SESSION_COOKIE = "wish_sess";
const MAX_AGE_S = 12 * 60 * 60;

/**
 * Proof that a session was created by /api/session (after consent). The write routes only accept a sessionId that
 * matches this cookie, so nobody can post events or wishes into a session they did not start.
 */
export async function issueSession(res: NextResponse, req: Request, sessionId: string) {
  res.cookies.set(SESSION_COOKIE, signedToken.make(await getSecret(), sessionId), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: MAX_AGE_S, secure: isHttps(req),
  });
}

/** The verified session id from the cookie, or null. */
export async function currentSession(): Promise<string | null> {
  const v = (await cookies()).get(SESSION_COOKIE)?.value;
  return v ? signedToken.verify(await getSecret(), v, MAX_AGE_S * 1000) : null;
}
