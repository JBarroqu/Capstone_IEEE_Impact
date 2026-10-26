import { NextResponse } from "next/server";
import { ADMIN_COOKIE, ADMIN_MAX_AGE_S, adminPasswordProblem, newAdminToken, passwordOk } from "@/lib/admin-auth";
import { config } from "@/lib/config";
import { clientIp, limited, rules } from "@/lib/rate-limit";
import { isHttps, isLocal, readJson } from "@/lib/request";

export async function POST(req: Request) {
  const rl = limited([rules.loginIp, clientIp(req)]);
  if (rl) return rl;
  const problem = adminPasswordProblem();
  if (problem) return NextResponse.json({ ok: false, error: `${problem} Set it in .env and restart.` }, { status: 503 });
  // Over plain http on the LAN the password crosses the Wi-Fi in cleartext: use the https port (Caddy) instead.
  if (!isHttps(req) && !isLocal(req) && !config.adminAllowHttp) {
    return NextResponse.json({ ok: false, error: "Open admin over https (port 3443 with docker compose) or on localhost." }, { status: 403 });
  }
  const { password } = ((await readJson(req, 1024)) ?? {}) as { password?: unknown };
  if (typeof password !== "string" || !(await passwordOk(password))) return NextResponse.json({ ok: false, error: "Wrong password." }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, await newAdminToken(), { httpOnly: true, sameSite: "strict", path: "/", maxAge: ADMIN_MAX_AGE_S, secure: isHttps(req) });
  return res;
}
