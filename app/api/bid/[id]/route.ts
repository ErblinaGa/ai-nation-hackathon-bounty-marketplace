// GET /api/bid/:id — status polling for a bid (no code field)
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureJobsRunning } from "@/lib/jobs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  ensureJobsRunning();

  const bidId = params.id;
  if (!bidId?.trim()) {
    return NextResponse.json(
      { success: false, error: "Bid ID is required" },
      { status: 400 }
    );
  }

  try {
    const db = getDb();

    const bid = db
      .prepare(
        `SELECT id, bounty_id, bidder_pubkey, bid_type, code_hash, ensemble_metadata,
                asked_price_sats, preview_metadata, test_status, test_output, status, submitted_at
         FROM bids WHERE id = ?`
      )
      .get(bidId) as
      | {
          id: string;
          bounty_id: string;
          bidder_pubkey: string;
          bid_type: string;
          code_hash: string;
          ensemble_metadata: string | null;
          asked_price_sats: number;
          preview_metadata: string;
          test_status: string;
          test_output: string | null;
          status: string;
          submitted_at: string;
        }
      | undefined;

    if (!bid) {
      return NextResponse.json(
        { success: false, error: "Bid not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: bid.id,
      bounty_id: bid.bounty_id,
      bidder_pubkey: bid.bidder_pubkey,
      bid_type: bid.bid_type ?? "code",
      code_hash: bid.code_hash,
      ensemble_metadata: (() => {
        if (!bid.ensemble_metadata) return null;
        try { return JSON.parse(bid.ensemble_metadata); } catch { return null; }
      })(),
      asked_price_sats: bid.asked_price_sats,
      preview_metadata: (() => {
        try {
          return JSON.parse(bid.preview_metadata);
        } catch {
          return { lines: 0, imports: [], runtime_ms: null, mem_mb: null };
        }
      })(),
      test_status: bid.test_status,
      test_output: bid.test_output,
      status: bid.status,
      submitted_at: bid.submitted_at,
    });
  } catch (err) {
    console.error(`[GET /api/bid/${bidId}] error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch bid" },
      { status: 500 }
    );
  }
}
