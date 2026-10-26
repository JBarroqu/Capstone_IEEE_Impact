import { cookies } from "next/headers";
import { config } from "./config";
import { getSecret, sameText, sign, signedToken } from "./secret";

export const ADMIN_COOKIE = "wish_admin";
export const ADMIN_MAX_AGE_S = 12 * 60 * 60;

/** Why admin login is switched off, or null if the password is usable. */
export function adminPasswordProblem(pw = config.adminPassword): string | null {
  if (!pw) return "ADMIN_PASSWORD is not set.";
  if (pw === "change-me" || pw.length < 8) return "ADMIN_PASSWORD is the default or shorter than 8 characters.";
  return null;
}

// Tied to the current password, so changing ADMIN_PASSWORD signs every admin out.
const payload = (secret: string) => `admin:${sign(secret, `pw:${config.adminPassword}`).slice(0, 16)}`;

export async function passwordOk(pw: string) {
  if (adminPasswordProblem()) return false;
  const secret = await getSecret();
  return sameText(sign(secret, `pw:${pw}`), sign(secret, `pw:${config.adminPassword}`));
}

/** Signed and timestamped; expires on the server after 12 h whatever the browser keeps. */
export async function newAdminToken() {
  const secret = await getSecret();
  return signedToken.make(secret, payload(secret));
}

export async function isAdmin() {
  if (adminPasswordProblem()) return false;
  const v = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!v) return false;
  const secret = await getSecret();
  return signedToken.verify(secret, v, ADMIN_MAX_AGE_S * 1000) === payload(secret);
}
