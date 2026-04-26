import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/middleware";
import { MOCK_USERS } from "@/lib/auth/session";
import { unauthorized } from "@/lib/api/errors";

export function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return unauthorized();
  const user = MOCK_USERS.find((u) => u.id === session.userId);
  if (!user) return unauthorized();
  return Response.json({ user });
}
