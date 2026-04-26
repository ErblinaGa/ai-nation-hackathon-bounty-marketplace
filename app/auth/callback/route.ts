// GET /auth/callback — exchanges the PKCE code from a magic link for a session,
// then redirects to /dashboard.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    console.error("[auth/callback] Missing code parameter");
    return NextResponse.redirect(new URL("/login?error=missing_code", req.url));
  }

  try {
    const supabase = await getServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[auth/callback] exchangeCodeForSession error:", error.message);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, req.url)
      );
    }

    return NextResponse.redirect(new URL(next, req.url));
  } catch (err) {
    console.error("[auth/callback] unexpected error:", err);
    return NextResponse.redirect(new URL("/login?error=callback_failed", req.url));
  }
}
