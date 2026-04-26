// Auth helpers — server-side (server components, API routes, middleware).
// getPubkeyFromRequest kept for backward compat with old code paths.
// NOTE: this module must only be imported from server-side code (server components, API routes).
import type { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Legacy pubkey auth — kept for backward compat (used by old bidder routes)
// ---------------------------------------------------------------------------

export function getPubkeyFromRequest(req: NextRequest): string | null {
  return req.headers.get("x-pubkey") ?? null;
}

export function requirePubkey(req: NextRequest): string {
  const pubkey = getPubkeyFromRequest(req);
  if (!pubkey || pubkey.trim() === "") {
    throw new Error("Missing x-pubkey header");
  }
  return pubkey.trim();
}

// ---------------------------------------------------------------------------
// Supabase auth helpers
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string | null;
  github_username: string | null;
  display_name: string | null;
  lightning_pubkey: string | null;
}

/**
 * getCurrentUser — for server components and API routes.
 * Returns the authenticated user profile or null if not logged in.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (process.env.USE_SUPABASE !== "true") return null;

  try {
    const supabase = await getServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) return null;

    // Fetch profile row from public.users (populated by trigger on auth.users insert)
    const { data: profile } = await supabase
      .from("users")
      .select("github_username, display_name, lightning_pubkey")
      .eq("id", user.id)
      .single();

    return {
      id: user.id,
      email: user.email ?? null,
      github_username: profile?.github_username ?? null,
      display_name: profile?.display_name ?? null,
      lightning_pubkey: profile?.lightning_pubkey ?? null,
    };
  } catch (err) {
    console.error("[auth][getCurrentUser] error:", err);
    return null;
  }
}

/**
 * requireUser — for protected API routes.
 * Throws a Response (401) if no session — use in try/catch or as a guard.
 */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  return user;
}

/**
 * requireUserApiKey — for CLI-auth API routes (x-api-key header).
 * Validates the key against SUPABASE_SECRET_KEY env var (simple API key pattern).
 * Extend with a real api_keys table for production.
 */
export function requireUserApiKey(req: NextRequest): void {
  const key = req.headers.get("x-api-key");
  if (!key) {
    throw new Error("[auth] Missing x-api-key header");
  }
  // In demo: accept the supabase secret key or a dedicated API_KEY env var
  const validKeys = [
    process.env.SUPABASE_SECRET_KEY,
    process.env.CLI_API_KEY,
  ].filter(Boolean);

  if (validKeys.length === 0) {
    // No keys configured — open access (dev mode only)
    console.warn("[auth][requireUserApiKey] No API keys configured — allowing request");
    return;
  }

  if (!validKeys.includes(key)) {
    throw new Error("[auth] Invalid x-api-key");
  }
}

/**
 * resolveUserFromApiKey — look up a user by their api_key (CLI bidder auth).
 * Returns the user with a guaranteed lightning_pubkey (generates+persists if missing).
 * Used by routes like POST /api/bounty/:id/bid where the bidder is a CLI agent.
 *
 * Returns null if:
 *  - no x-api-key header
 *  - api_key doesn't match any user
 *  - the api_key is the legacy SUPABASE_SECRET_KEY (system-level access, not a user)
 */
export async function resolveUserFromApiKey(
  req: NextRequest
): Promise<AuthUser | null> {
  const key = req.headers.get("x-api-key");
  if (!key) return null;

  // System-level keys aren't tied to a user; bid routes must use a per-user key.
  if (key === process.env.SUPABASE_SECRET_KEY) return null;

  try {
    const { getDb } = await import("@/lib/db");
    const db = getDb();

    const row = db
      .prepare(
        "SELECT id, email, github_username, display_name, lightning_pubkey FROM users WHERE api_key = ?"
      )
      .get(key) as
      | {
          id: string;
          email: string | null;
          github_username: string | null;
          display_name: string | null;
          lightning_pubkey: string | null;
        }
      | undefined;

    if (!row) return null;

    // Guarantee a pubkey for wallet crediting — generate + persist if missing.
    let pubkey = row.lightning_pubkey;
    if (!pubkey) {
      pubkey = generateLightningPubkey();
      try {
        db.prepare("UPDATE users SET lightning_pubkey = ? WHERE id = ?").run(
          pubkey,
          row.id
        );
      } catch (err) {
        console.warn("[auth][resolveUserFromApiKey] could not persist pubkey:", err);
      }
    }

    return {
      id: row.id,
      email: row.email,
      github_username: row.github_username,
      display_name: row.display_name,
      lightning_pubkey: pubkey,
    };
  } catch (err) {
    console.error("[auth][resolveUserFromApiKey] error:", err);
    return null;
  }
}

/**
 * generateLightningPubkey — deterministic hex pubkey from a UUID.
 * Used when a user first posts a bounty or places a bid and has no pubkey yet.
 */
export function generateLightningPubkey(): string {
  const { randomBytes } = require("crypto") as typeof import("crypto");
  return "02" + randomBytes(32).toString("hex");
}

/**
 * ensureLightningPubkey — fetches user's lightning_pubkey; generates + persists if missing.
 * Returns the pubkey string.
 */
export async function ensureLightningPubkey(userId: string): Promise<string> {
  const supabase = await getServerClient();

  const { data: profile } = await supabase
    .from("users")
    .select("lightning_pubkey")
    .eq("id", userId)
    .single();

  if (profile?.lightning_pubkey) {
    return profile.lightning_pubkey as string;
  }

  const pubkey = generateLightningPubkey();

  const { error } = await supabase
    .from("users")
    .update({ lightning_pubkey: pubkey })
    .eq("id", userId);

  if (error) {
    console.error("[auth][ensureLightningPubkey] failed to persist pubkey:", error);
    // Return the generated key anyway — it'll be used for this request
  }

  return pubkey;
}
