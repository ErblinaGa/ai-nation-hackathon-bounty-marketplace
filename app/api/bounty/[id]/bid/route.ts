// POST /api/bounty/:id/bid — submit a bid (hash-commit + stake invoice)
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { getLightningClient } from "@/lib/lightning";
import { sha256 } from "@/lib/hash";
import { computePreview } from "@/lib/preview";
import { ensureJobsRunning } from "@/lib/jobs";
import type { SubmitBidRequest, SubmitBidResponse } from "@/lib/types";

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

  let body: SubmitBidRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.bidder_pubkey?.trim()) {
    return NextResponse.json(
      { success: false, error: "bidder_pubkey is required" },
      { status: 400 }
    );
  }
  if (!body.code?.trim()) {
    return NextResponse.json(
      { success: false, error: "code is required" },
      { status: 400 }
    );
  }
  if (!body.asked_price_sats || body.asked_price_sats <= 0) {
    return NextResponse.json(
      { success: false, error: "asked_price_sats must be a positive integer" },
      { status: 400 }
    );
  }

  try {
    const db = getDb();

    const bounty = db
      .prepare(
        "SELECT id, status, max_bounty_sats, bid_stake_sats, language, deadline_at FROM bounties WHERE id = ?"
      )
      .get(bountyId) as
      | {
          id: string;
          status: string;
          max_bounty_sats: number;
          bid_stake_sats: number;
          language: string;
          deadline_at: string;
        }
      | undefined;

    if (!bounty) {
      return NextResponse.json(
        { success: false, error: "Bounty not found" },
        { status: 404 }
      );
    }
    if (bounty.status !== "OPEN") {
      return NextResponse.json(
        { success: false, error: `Bounty is not open (status: ${bounty.status})` },
        { status: 409 }
      );
    }
    if (new Date(bounty.deadline_at) <= new Date()) {
      return NextResponse.json(
        { success: false, error: "Bounty deadline has passed" },
        { status: 409 }
      );
    }
    if (body.asked_price_sats > bounty.max_bounty_sats) {
      return NextResponse.json(
        {
          success: false,
          error: `asked_price_sats (${body.asked_price_sats}) exceeds max_bounty_sats (${bounty.max_bounty_sats})`,
        },
        { status: 400 }
      );
    }

    const codeHash = sha256(body.code);
    const bidId = `bid_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

    // Preview metadata computed without sandbox result (runtime unknown at submit time)
    const previewMeta = computePreview(
      body.code,
      bounty.language as "typescript" | "python"
    );

    const lightning = getLightningClient();
    const stakeInvoice = await lightning.createHoldInvoice(
      bounty.bid_stake_sats,
      `Bid stake: ${bidId}`,
      body.bidder_pubkey
    );

    const bidType = body.bid_type ?? "code";
    const ensembleMetaJson =
      body.ensemble_metadata != null
        ? JSON.stringify(body.ensemble_metadata)
        : null;

    db.prepare(
      `INSERT INTO bids
         (id, bounty_id, bidder_pubkey, bid_type, code_hash, code, ensemble_metadata,
          asked_price_sats, stake_invoice, stake_payment_hash, preview_metadata, test_status, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'AWAITING_STAKE')`
    ).run(
      bidId,
      bountyId,
      body.bidder_pubkey,
      bidType,
      codeHash,
      body.code, // stored but never returned unless winner
      ensembleMetaJson,
      body.asked_price_sats,
      stakeInvoice.paymentRequest,
      stakeInvoice.paymentHash,
      JSON.stringify(previewMeta)
    );

    const response: SubmitBidResponse = {
      bid_id: bidId,
      stake_invoice: stakeInvoice.paymentRequest,
      stake_payment_hash: stakeInvoice.paymentHash,
      code_hash: codeHash,
      status: "AWAITING_STAKE",
    };

    return NextResponse.json(response, { status: 201 });
  } catch (err) {
    console.error(`[POST /api/bounty/${bountyId}/bid] error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to create bid" },
      { status: 500 }
    );
  }
}
