// POST /api/bounty/:id/expire — manually trigger expiry (also runs via bg job)
// If ≥1 PASS bid exists: auto-selects cheapest. Else: cancels poster stake, marks EXPIRED.
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { expireBounty, ensureJobsRunning } from "@/lib/jobs";

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

  try {
    const db = getDb();

    const bounty = db
      .prepare("SELECT id, status FROM bounties WHERE id = ?")
      .get(bountyId) as { id: string; status: string } | undefined;

    if (!bounty) {
      return NextResponse.json(
        { success: false, error: "Bounty not found" },
        { status: 404 }
      );
    }
    if (!["OPEN", "AWAITING_STAKE_PAYMENT"].includes(bounty.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Bounty already in terminal state: ${bounty.status}`,
        },
        { status: 409 }
      );
    }

    await expireBounty(bountyId);

    const updated = db
      .prepare("SELECT status, winning_bid_id FROM bounties WHERE id = ?")
      .get(bountyId) as { status: string; winning_bid_id: string | null };

    return NextResponse.json({
      bounty_id: bountyId,
      status: updated.status,
      winning_bid_id: updated.winning_bid_id,
    });
  } catch (err) {
    console.error(`[POST /api/bounty/${bountyId}/expire] error:`, err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to expire bounty",
      },
      { status: 500 }
    );
  }
}
