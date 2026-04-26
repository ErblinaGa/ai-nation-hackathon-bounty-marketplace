// GET /api/bounty/:id/winning-diff
// Returns the winning bid's diff for a SETTLED GitHub bounty.
// Auth: x-pubkey must match poster_pubkey (only poster can get the diff for PR creation).
// Also used by gh-pr CLI command and auto-PR jobs.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getPubkeyFromRequest } from "@/lib/auth";

interface WinningDiffResponse {
  bid_id: string;
  bidder_pubkey: string;
  asked_price_sats: number;
  diff: string;
  test_output: string | null;
  auditor_reasoning: string | null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!id?.trim()) {
    return NextResponse.json(
      { success: false, error: "Bounty ID is required" },
      { status: 400 },
    );
  }

  const callerPubkey = getPubkeyFromRequest(req);

  try {
    const db = getDb();

    const bounty = db
      .prepare(
        `SELECT id, poster_pubkey, status, winning_bid_id, auditor_result
         FROM bounties WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          poster_pubkey: string;
          status: string;
          winning_bid_id: string | null;
          auditor_result: string | null;
        }
      | undefined;

    if (!bounty) {
      return NextResponse.json(
        { success: false, error: "Bounty not found" },
        { status: 404 },
      );
    }

    if (bounty.status !== "SETTLED") {
      return NextResponse.json(
        { success: false, error: `Bounty is not SETTLED (status: ${bounty.status})` },
        { status: 400 },
      );
    }

    if (!bounty.winning_bid_id) {
      return NextResponse.json(
        { success: false, error: "No winning bid on this bounty" },
        { status: 400 },
      );
    }

    // Auth: only poster may access the winning diff
    if (callerPubkey && callerPubkey !== bounty.poster_pubkey) {
      return NextResponse.json(
        { success: false, error: "Forbidden: only the poster can access the winning diff" },
        { status: 403 },
      );
    }

    const bid = db
      .prepare(
        `SELECT id, bidder_pubkey, asked_price_sats, code, test_output
         FROM bids WHERE id = ?`,
      )
      .get(bounty.winning_bid_id) as
      | {
          id: string;
          bidder_pubkey: string;
          asked_price_sats: number;
          code: string | null;
          test_output: string | null;
        }
      | undefined;

    if (!bid) {
      return NextResponse.json(
        { success: false, error: "Winning bid record not found" },
        { status: 404 },
      );
    }

    if (!bid.code) {
      return NextResponse.json(
        { success: false, error: "Winning bid has no code/diff stored" },
        { status: 400 },
      );
    }

    // Extract per-bid auditor reasoning if available
    let auditorReasoning: string | null = null;
    if (bounty.auditor_result) {
      try {
        const result = JSON.parse(bounty.auditor_result) as {
          ranked?: Array<{ bid_id: string; reasoning: string }>;
        };
        const entry = result.ranked?.find((r) => r.bid_id === bounty.winning_bid_id);
        auditorReasoning = entry?.reasoning ?? null;
      } catch {
        // non-fatal
      }
    }

    const response: WinningDiffResponse = {
      bid_id: bid.id,
      bidder_pubkey: bid.bidder_pubkey,
      asked_price_sats: bid.asked_price_sats,
      diff: bid.code,
      test_output: bid.test_output,
      auditor_reasoning: auditorReasoning,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error(`[GET /api/bounty/${id}/winning-diff] error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch winning diff" },
      { status: 500 },
    );
  }
}
