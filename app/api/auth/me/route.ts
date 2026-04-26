// GET /api/auth/me — return current user profile for CLI `lb auth status`
// Authenticated via x-api-key header.
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

function getUserByApiKey(apiKey: string) {
  try {
    const db = getDb();
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).get();

    if (!tableExists) return null;

    return db.prepare(
      "SELECT id, email, display_name, lightning_pubkey, role FROM users WHERE api_key = ?"
    ).get(apiKey) as {
      id: string;
      email: string;
      display_name: string | null;
      lightning_pubkey: string | null;
      role: string | null;
    } | null;
  } catch {
    return null;
  }
}

function getStubUserByApiKey(apiKey: string) {
  // In stub mode any key starting with "stub_" is valid
  if (!apiKey.startsWith("stub_")) return null;
  const emailHex = apiKey.slice(5);
  let email = "demo@example.com";
  try {
    email = Buffer.from(emailHex, "hex").toString("utf8");
  } catch { /* use default */ }
  return {
    id: "stub_user",
    email,
    display_name: email.split("@")[0],
    lightning_pubkey: "02demo_bidder_pubkey",
    role: "bidder",
  };
}

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey?.trim()) {
    return NextResponse.json(
      { success: false, error: "Missing x-api-key header" },
      { status: 401 }
    );
  }

  // Stub mode
  if (process.env.USE_SUPABASE !== "true") {
    const stubUser = getStubUserByApiKey(apiKey);
    if (!stubUser) {
      return NextResponse.json(
        { success: false, error: "Invalid API key" },
        { status: 401 }
      );
    }
    return NextResponse.json({ success: true, user: stubUser });
  }

  // Real mode — look up by api_key in users table
  const user = getUserByApiKey(apiKey);
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Invalid API key" },
      { status: 401 }
    );
  }

  return NextResponse.json({ success: true, user });
}
