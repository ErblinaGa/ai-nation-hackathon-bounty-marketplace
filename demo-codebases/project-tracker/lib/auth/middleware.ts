// Server-side auth check helper used by Next.js middleware
import { NextRequest } from "next/server";

const SESSION_COOKIE = "pt_session";

export function getSessionFromRequest(req: NextRequest): { userId: string } | null {
  const raw = req.cookies.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const session = JSON.parse(decoded) as { userId: string; expiresAt: string };
    if (new Date(session.expiresAt) < new Date()) return null;
    return { userId: session.userId };
  } catch {
    return null;
  }
}

export const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}
