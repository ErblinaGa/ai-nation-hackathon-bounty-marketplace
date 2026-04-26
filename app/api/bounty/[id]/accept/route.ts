// POST /api/bounty/:id/accept — poster accepts a winning bid
// Settles poster stake, refunds other PASS bidders, reveals code
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { acceptBid, ensureJobsRunning } from "@/lib/jobs";
import type { AcceptBidRequest, AcceptBidResponse } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  ensureJobsRunning();

  const bountyId = params.id;
  if (!bountyId?.trim()) {
    return NextResponse.json(
      { success: false, error: "Bounty ID is required" },
      { status: 400 }
    );
  }

  let body: AcceptBidRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.bid_id?.trim()) {
    return NextResponse.json(
      { success: false, error: "bid_id is required" },
      { status: 400 }
    );
  }
  if (!body.poster_pubkey?.trim()) {
    return NextResponse.json(
      { success: false, error: "poster_pubkey is required" },
      { status: 400 }
    );
  }

  try {
    const db = getDb();

    // Verify caller is the bounty poster
    const bounty = db
      .prepare("SELECT poster_pubkey, status FROM bounties WHERE id = ?")
      .get(bountyId) as { poster_pubkey: string; status: string } | undefined;

    if (!bounty) {
      return NextResponse.json(
        { success: false, error: "Bounty not found" },
        { status: 404 }
      );
    }
    if (bounty.poster_pubkey !== body.poster_pubkey) {
      return NextResponse.json(
        { success: false, error: "Only the poster can accept bids" },
        { status: 403 }
      );
    }
    if (bounty.status !== "OPEN") {
      return NextResponse.json(
        {
          success: false,
          error: `Bounty is not OPEN (status: ${bounty.status})`,
        },
        { status: 409 }
      );
    }

    // Verify the bid is a PASS
    const bid = db
      .prepare(
        "SELECT id, test_status, status FROM bids WHERE id = ? AND bounty_id = ?"
      )
      .get(body.bid_id, bountyId) as
      | { id: string; test_status: string; status: string }
      | undefined;

    if (!bid) {
      return NextResponse.json(
        { success: false, error: "Bid not found" },
        { status: 404 }
      );
    }
    if (bid.test_status !== "PASS") {
      return NextResponse.json(
        {
          success: false,
          error: `Bid test status is ${bid.test_status} — only PASS bids can be accepted`,
        },
        { status: 409 }
      );
    }

    const result = await acceptBid(bountyId, body.bid_id);

    const response: AcceptBidResponse = {
      bid_id: body.bid_id,
      code: result.code,
      payment_hash: result.payment_hash,
      settled_amount_sats: result.settled_amount_sats,
      refunded_to_poster_sats: result.refunded_to_poster_sats,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error(`[POST /api/bounty/${bountyId}/accept] error:`, err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to accept bid",
      },
      { status: 500 }
    );
  }
}
