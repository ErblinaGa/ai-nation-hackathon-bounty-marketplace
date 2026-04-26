// POST /api/auth/cli-verify — verify OTP, issue API key
// Exchanges a 6-digit OTP for a persistent API key stored in the users table.
// In stub mode, accepts code "000000" and returns a deterministic demo key.
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getDb } from "@/lib/db";

function generateApiKey(): string {
  return randomBytes(32).toString("hex");
}

export async function POST(req: NextRequest) {
  let body: { email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const email = body.email?.trim().toLowerCase();
  const code = body.code?.trim();

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { success: false, error: "Valid email is required" },
      { status: 400 }
    );
  }
  if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { success: false, error: "code must be a 6-digit number" },
      { status: 400 }
    );
  }

  // Stub mode: accept "000000" as the demo code
  if (process.env.USE_SUPABASE !== "true") {
    if (code !== "000000") {
      return NextResponse.json(
        { success: false, error: "Invalid OTP code (stub mode: use 000000)" },
        { status: 401 }
      );
    }

    // Return a deterministic stub api_key for this email
    const stubKey = "stub_" + Buffer.from(email).toString("hex").slice(0, 24);
    return NextResponse.json({
      success: true,
      api_key: stubKey,
      user_id: "stub_user",
      email,
      display_name: email.split("@")[0],
    });
  }

  // Real Supabase mode
  try {
    const { getAdminClient } = await import("@/lib/supabase");
    const supabase = getAdminClient();

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    if (error || !data.user) {
      console.error("[auth/cli-verify] OTP verification failed:", error);
      return NextResponse.json(
        { success: false, error: "Invalid or expired OTP code" },
        { status: 401 }
      );
    }

    const userId = data.user.id;
    const apiKey = generateApiKey();

    // Ensure users row exists (created by Supabase trigger on signup, but new users may not have it yet)
    // We use the SQLite DB here — in production this would be Supabase Postgres
    try {
      const db = getDb();
      // Check if users table exists (added by Team B migration)
      const tableExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
      ).get();

      if (tableExists) {
        db.prepare(
          `INSERT OR IGNORE INTO users (id, email, api_key, created_at)
           VALUES (?, ?, ?, datetime('now'))`
        ).run(userId, email, apiKey);

        db.prepare(
          `UPDATE users SET api_key = ? WHERE id = ?`
        ).run(apiKey, userId);

        const user = db.prepare(
          "SELECT id, email, display_name, lightning_pubkey FROM users WHERE id = ?"
        ).get(userId) as { id: string; email: string; display_name: string | null; lightning_pubkey: string | null } | undefined;

        return NextResponse.json({
          success: true,
          api_key: apiKey,
          user_id: userId,
          email: user?.email ?? email,
          display_name: user?.display_name ?? null,
        });
      }
    } catch (dbErr) {
      // users table may not exist yet (Team B migration pending)
      // Return the api_key anyway so CLI is functional
      console.warn("[auth/cli-verify] users table not available:", dbErr);
    }

    return NextResponse.json({
      success: true,
      api_key: apiKey,
      user_id: userId,
      email,
      display_name: null,
    });
  } catch (err) {
    console.error("[auth/cli-verify] unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
