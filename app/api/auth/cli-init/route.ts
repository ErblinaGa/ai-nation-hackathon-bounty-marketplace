// POST /api/auth/cli-init — initiate CLI magic link auth
// Triggers a Supabase OTP email so the bidder can paste the 6-digit code.
// In stub mode (USE_SUPABASE != "true"), returns a demo OTP so testing works without email.
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { success: false, error: "Valid email is required" },
      { status: 400 }
    );
  }

  // Stub mode: no real Supabase, return a demo stub response
  if (process.env.USE_SUPABASE !== "true") {
    console.log(`[auth/cli-init] stub mode — skipping real OTP for ${email}`);
    return NextResponse.json({
      sent: true,
      message: "stub mode: use OTP code 000000",
    });
  }

  try {
    const { getAdminClient } = await import("@/lib/supabase");
    const supabase = getAdminClient();

    const { error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (error) {
      console.error("[auth/cli-init] Supabase OTP error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to send magic link: " + error.message },
        { status: 500 }
      );
    }

    // Also try signInWithOtp for email OTP (6-digit code, not magic link URL)
    const { error: otpError } = await supabase.auth.signInWithOtp({ email });
    if (otpError) {
      console.error("[auth/cli-init] Supabase signInWithOtp error:", otpError);
      return NextResponse.json(
        { success: false, error: "Failed to send OTP: " + otpError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sent: true,
      message: "Check your email for a 6-digit code",
    });
  } catch (err) {
    console.error("[auth/cli-init] unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
