// GET /api/stats/:pubkey — public settlement statistics for a pubkey
// No auth required — these are public market transparency stats.
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureJobsRunning } from "@/lib/jobs";
import type { PublicStats } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: { pubkey: string } }
) {
  ensureJobsRunning();

  const { pubkey } = params;
  if (!pubkey?.trim()) {
    return NextResponse.json(
      { success: false, error: "pubkey is required" },
      { status: 400 }
    );
  }

  try {
    const db = getDb();

    const row = db
      .prepare(
        `SELECT
           total_bids,
           wins,
           passes,
           avg_won_price_sats,
           unique_bounties_bid
         FROM public_stats WHERE pubkey = ?`
      )
      .get(pubkey) as
      | {
          total_bids: number;
          wins: number;
          passes: number;
          avg_won_price_sats: number | null;
          unique_bounties_bid: number;
        }
      | undefined;

    // Return zeroed stats for unknown pubkeys — they just haven't bid yet
    const stats: PublicStats = {
      pubkey,
      total_bids: row?.total_bids ?? 0,
      wins: row?.wins ?? 0,
      passes: row?.passes ?? 0,
      win_rate:
        row && row.total_bids > 0 ? row.wins / row.total_bids : 0,
      pass_rate:
        row && row.total_bids > 0 ? row.passes / row.total_bids : 0,
      avg_won_price_sats: row?.avg_won_price_sats ?? null,
      unique_bounties: row?.unique_bounties_bid ?? 0,
    };

    return NextResponse.json(stats);
  } catch (err) {
    console.error(`[GET /api/stats/${pubkey}] error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
