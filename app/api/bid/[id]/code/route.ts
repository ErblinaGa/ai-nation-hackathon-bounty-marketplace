// GET /api/bid/:id/code — reveals code to authorized parties
// Auth: x-pubkey header. Allowed: poster of the bounty OR the winning bidder.
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getPubkeyFromRequest } from "@/lib/auth";
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

  const callerPubkey = getPubkeyFromRequest(req);
  if (!callerPubkey) {
    return NextResponse.json(
      { success: false, error: "x-pubkey header required" },
      { status: 401 }
    );
  }

  try {
    const db = getDb();

    const bid = db
      .prepare(
        `SELECT b.id, b.bounty_id, b.bidder_pubkey, b.code, b.status,
                b.test_status, b.code_hash,
                bn.poster_pubkey, bn.status as bounty_status, bn.winning_bid_id
         FROM bids b
         JOIN bounties bn ON bn.id = b.bounty_id
         WHERE b.id = ?`
      )
      .get(bidId) as
      | {
          id: string;
          bounty_id: string;
          bidder_pubkey: string;
          code: string | null;
          status: string;
          test_status: string;
          code_hash: string;
          poster_pubkey: string;
          bounty_status: string;
          winning_bid_id: string | null;
        }
      | undefined;

    if (!bid) {
      return NextResponse.json(
        { success: false, error: "Bid not found" },
        { status: 404 }
      );
    }

    const isPoster = callerPubkey === bid.poster_pubkey;
    const isWinningBidder =
      callerPubkey === bid.bidder_pubkey &&
      bid.winning_bid_id === bidId &&
      bid.bounty_status === "SETTLED";

    if (!isPoster && !isWinningBidder) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Code is only revealed to the bounty poster or the winning bidder after settlement",
        },
        { status: 403 }
      );
    }

    if (!bid.code) {
      return NextResponse.json(
        { success: false, error: "Code not available" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      bid_id: bid.id,
      code: bid.code,
      code_hash: bid.code_hash,
      status: bid.status,
    });
  } catch (err) {
    console.error(`[GET /api/bid/${bidId}/code] error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch bid code" },
      { status: 500 }
    );
  }
}
