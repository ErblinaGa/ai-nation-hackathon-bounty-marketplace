import { NextRequest } from "next/server";
import { findUser } from "@/lib/auth/session";
import { validateLoginForm } from "@/lib/validation";
import { badRequest, unauthorized } from "@/lib/api/errors";

export async function POST(req: NextRequest) {
  const body = await req.json() as unknown;
  const result = validateLoginForm(body);
  if (!result.valid) return badRequest(Object.values(result.errors).join(", "));

  const { email, password } = body as { email: string; password: string };
  const user = findUser(email, password);
  if (!user) return unauthorized();

  // Client sets the cookie via lib/auth/session.ts — this endpoint just validates
  return Response.json({ user });
}
