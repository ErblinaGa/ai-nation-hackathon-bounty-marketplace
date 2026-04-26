import { NextResponse } from "next/server";

const SESSION_COOKIE = "pt_session";

export function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
