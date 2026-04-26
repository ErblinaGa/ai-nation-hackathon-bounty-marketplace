// GET /api/bids — list bids for the authenticated caller
// Authenticated via x-api-key (resolves to bidder_pubkey) or x-pubkey (legacy)
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const DEMO_BIDDER_PUBKEY = "02demo_bidder_pubkey";

function resolveCallerPubkey(req: NextRequest): string | null {
  // API key auth (new)
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) {
    if (process.env.USE_SUPABASE !== "true") {
      return DEMO_BIDDER_PUBKEY;
    }
    try {
      const db = getDb();
      const tableExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
      ).get();
      if (!tableExists) return DEMO_BIDDER_PUBKEY;

      const user = db.prepare(
        "SELECT lightning_pubkey FROM users WHERE api_key = ?"
      ).get(apiKey) as { lightning_pubkey: string | null } | undefined;

      return user?.lightning_pubkey ?? DEMO_BIDDER_PUBKEY;
    } catch {
      return DEMO_BIDDER_PUBKEY;
    }
  }

  // Legacy pubkey auth
  const pubkey = req.headers.get("x-pubkey");
  return pubkey?.trim() || null;
}

export async function GET(req: NextRequest) {
  const pubkey = resolveCallerPubkey(req);

  if (!pubkey) {
    return NextResponse.json(
      { success: false, error: "Authentication required: provide x-api-key or x-pubkey header" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 200) : 50;

  if (isNaN(limit) || limit <= 0) {
    return NextResponse.json(
      { success: false, error: "limit must be a positive integer" },
      { status: 400 }
    );
  }

  try {
    const db = getDb();

    const bids = db.prepare(
      `SELECT
         b.id, b.bounty_id, b.bid_type, b.code_hash, b.asked_price_sats,
         b.test_status, b.status, b.submitted_at,
         b.test_output,
         bn.title as bounty_title, bn.max_bounty_sats as bounty_max_sats
       FROM bids b
       LEFT JOIN bounties bn ON bn.id = b.bounty_id
       WHERE b.bidder_pubkey = ?
       ORDER BY b.submitted_at DESC
       LIMIT ?`
    ).all(pubkey, limit) as Array<{
      id: string;
      bounty_id: string;
      bid_type: string;
      code_hash: string;
      asked_price_sats: number;
      test_status: string;
      status: string;
      submitted_at: string;
      test_output: string | null;
      bounty_title: string | null;
      bounty_max_sats: number | null;
    }>;

    return NextResponse.json({
      success: true,
      bids: bids.map((b) => ({
        bid_id: b.id,
        bounty_id: b.bounty_id,
        bounty_title: b.bounty_title,
        bid_type: b.bid_type ?? "code",
        code_hash: b.code_hash,
        asked_price_sats: b.asked_price_sats,
        test_status: b.test_status,
        status: b.status,
        submitted_at: b.submitted_at,
        payout_sats: b.status === "WON" ? b.asked_price_sats : null,
      })),
      pubkey,
    });
  } catch (err) {
    console.error("[GET /api/bids] error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch bids" },
      { status: 500 }
    );
  }
}
