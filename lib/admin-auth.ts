import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { config } from "./config";

export const ADMIN_COOKIE = "wish_admin";
export const tokenFor = (pw: string) => createHash("sha256").update(`wish-admin:${pw}`).digest("hex");

export function passwordOk(pw: string) {
  if (!config.adminPassword) return false;
  const a = Buffer.from(tokenFor(pw)), b = Buffer.from(tokenFor(config.adminPassword));
  return timingSafeEqual(a, b);
}

export async function isAdmin() {
  if (!config.adminPassword) return false;
  const v = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!v) return false;
  const a = Buffer.from(v), b = Buffer.from(tokenFor(config.adminPassword));
  return a.length === b.length && timingSafeEqual(a, b);
}
