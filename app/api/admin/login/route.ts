import { NextResponse } from "next/server";
import { ADMIN_COOKIE, passwordOk, tokenFor } from "@/lib/admin-auth";

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !passwordOk(password)) return NextResponse.json({ ok: false, error: "Wrong password." }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  // Secure only over HTTPS: a Secure cookie is dropped on plain-http LAN URLs (e.g. http://192.168.x.x:3010/admin).
  const https = (req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")) === "https";
  res.cookies.set(ADMIN_COOKIE, tokenFor(password), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12, secure: https });
  return res;
}
