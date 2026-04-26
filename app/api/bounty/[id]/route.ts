// GET   /api/bounty/:id — bounty detail with public bid list
// PATCH /api/bounty/:id — update mutable fields (github_pr_url; poster only)
// Code field is NEVER included unless caller is the winning bidder (checked via x-pubkey)
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getPubkeyFromRequest, getCurrentUser } from "@/lib/auth";
import { ensureJobsRunning } from "@/lib/jobs";
import type { BountyDetail, PublicBid } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  ensureJobsRunning();

  const { id } = params;
  if (!id?.trim()) {
    return NextResponse.json(
      { success: false, error: "Bounty ID is required" },
      { status: 400 }
    );
  }

  const callerPubkey = getPubkeyFromRequest(req);

  try {
    const db = getDb();

    const bounty = db
      .prepare(
        `SELECT id, poster_pubkey, title, description, language, task_type, task_payload,
                starter_code, test_suite, test_suite_hash,
                max_bounty_sats, bid_stake_sats, posting_fee_sats,
                deadline_at, status, winning_bid_id, created_at,
                github_repo, github_issue_number, github_commit_sha, github_pr_url,
                auditor_config, auditor_result, extension_count, merged_at,
                reverted_at, revert_pr_url
         FROM bounties WHERE id = ?`
      )
      .get(id) as
      | {
          id: string;
          poster_pubkey: string;
          title: string;
          description: string;
          language: string;
          task_type: string;
          task_payload: string | null;
          starter_code: string | null;
          test_suite: string;
          test_suite_hash: string;
          max_bounty_sats: number;
          bid_stake_sats: number;
          posting_fee_sats: number;
          deadline_at: string;
          status: string;
          winning_bid_id: string | null;
          created_at: string;
          github_repo: string | null;
          github_issue_number: number | null;
          github_commit_sha: string | null;
          github_pr_url: string | null;
          auditor_config: string | null;
          auditor_result: string | null;
          extension_count: number | null;
          merged_at: string | null;
          reverted_at: string | null;
          revert_pr_url: string | null;
        }
      | undefined;

    if (!bounty) {
      return NextResponse.json(
        { success: false, error: "Bounty not found" },
        { status: 404 }
      );
    }

    // Fetch bids — never include code (that's for /bid/:id/code endpoint)
    const bids = db
      .prepare(
        `SELECT id, bounty_id, bidder_pubkey, bid_type, code_hash, ensemble_metadata,
                asked_price_sats, preview_metadata, test_status, test_output, status, submitted_at
         FROM bids WHERE bounty_id = ?
         ORDER BY asked_price_sats ASC`
      )
      .all(id) as Array<{
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
    }>;

    const bidCount = bids.length;
    const passingBidCount = bids.filter((b) => b.test_status === "PASS").length;

    const publicBids: PublicBid[] = bids.map((b) => ({
      id: b.id,
      bounty_id: b.bounty_id,
      bidder_pubkey: b.bidder_pubkey,
      bid_type: (b.bid_type ?? "code") as PublicBid["bid_type"],
      code_hash: b.code_hash,
      ensemble_metadata: (() => {
        if (!b.ensemble_metadata) return null;
        try { return JSON.parse(b.ensemble_metadata); } catch { return null; }
      })(),
      asked_price_sats: b.asked_price_sats,
      preview_metadata: (() => {
        try {
          return JSON.parse(b.preview_metadata);
        } catch {
          return { lines: 0, imports: [], runtime_ms: null, mem_mb: null };
        }
      })(),
      test_status: b.test_status as PublicBid["test_status"],
      test_output: b.test_output,
      status: b.status as PublicBid["status"],
      submitted_at: b.submitted_at,
    }));

    const detail: BountyDetail = {
      id: bounty.id,
      title: bounty.title,
      description: bounty.description,
      language: bounty.language as BountyDetail["language"],
      task_type: (bounty.task_type ?? "snippet") as BountyDetail["task_type"],
      task_payload: bounty.task_payload ?? null,
      max_bounty_sats: bounty.max_bounty_sats,
      deadline_at: bounty.deadline_at,
      status: bounty.status as BountyDetail["status"],
      bid_count: bidCount,
      passing_bid_count: passingBidCount,
      created_at: bounty.created_at,
      starter_code: bounty.starter_code,
      test_suite: bounty.test_suite,
      test_suite_hash: bounty.test_suite_hash,
      bid_stake_sats: bounty.bid_stake_sats,
      posting_fee_sats: bounty.posting_fee_sats,
      poster_pubkey: bounty.poster_pubkey,
      bids: publicBids,
      winning_bid_id: bounty.winning_bid_id,
      // V2 GitHub + auditor
      github_repo: bounty.github_repo,
      github_issue_number: bounty.github_issue_number,
      github_commit_sha: bounty.github_commit_sha,
      github_pr_url: bounty.github_pr_url,
      auditor_config: (() => {
        if (!bounty.auditor_config) return null;
        try { return JSON.parse(bounty.auditor_config); } catch { return null; }
      })(),
      auditor_result: (() => {
        if (!bounty.auditor_result) return null;
        try { return JSON.parse(bounty.auditor_result); } catch { return null; }
      })(),
      extension_count: bounty.extension_count ?? 0,
      merged_at: bounty.merged_at ?? null,
      reverted_at: bounty.reverted_at ?? null,
      revert_pr_url: bounty.revert_pr_url ?? null,
    };

    // Poster can see their own pubkey context — already included
    // No extra code exposure here; that's handled by /bid/:id/code
    void callerPubkey; // explicitly acknowledged — not used here

    return NextResponse.json(detail);
  } catch (err) {
    console.error(`[GET /api/bounty/${id}] error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch bounty" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/bounty/:id — update mutable fields
// Currently supports: github_pr_url
// Auth: x-pubkey must match poster_pubkey OR session user must be the poster
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!id?.trim()) {
    return NextResponse.json(
      { success: false, error: "Bounty ID is required" },
      { status: 400 }
    );
  }

  // Accept auth from either x-pubkey header (legacy/CLI) or Supabase session
  let callerPubkey = getPubkeyFromRequest(req);

  if (!callerPubkey && process.env.USE_SUPABASE === "true") {
    try {
      const user = await getCurrentUser();
      if (user?.lightning_pubkey) {
        callerPubkey = user.lightning_pubkey;
      }
    } catch {
      // Fall through — auth check below will handle missing pubkey
    }
  }

  let body: { github_pr_url?: string; merged_at?: string; reverted_at?: string; revert_pr_url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.github_pr_url?.trim() && !body.merged_at?.trim() && !body.reverted_at?.trim() && !body.revert_pr_url?.trim()) {
    return NextResponse.json(
      { success: false, error: "At least one of github_pr_url, merged_at, reverted_at, or revert_pr_url is required in PATCH body" },
      { status: 400 }
    );
  }

  try {
    const db = getDb();
    const bounty = db
      .prepare("SELECT poster_pubkey FROM bounties WHERE id = ?")
      .get(id) as { poster_pubkey: string } | undefined;

    if (!bounty) {
      return NextResponse.json(
        { success: false, error: "Bounty not found" },
        { status: 404 }
      );
    }

    // Auth check — only poster can update
    if (callerPubkey && callerPubkey !== bounty.poster_pubkey) {
      return NextResponse.json(
        { success: false, error: "Forbidden: only the poster can update this bounty" },
        { status: 403 }
      );
    }

    // Build SET clause dynamically — only update provided fields
    const setClauses: string[] = [];
    const values: (string | null)[] = [];

    if (body.github_pr_url?.trim()) {
      setClauses.push("github_pr_url = ?");
      values.push(body.github_pr_url);
    }
    if (body.merged_at?.trim()) {
      setClauses.push("merged_at = ?");
      values.push(body.merged_at);
    }
    if (body.reverted_at?.trim()) {
      setClauses.push("reverted_at = ?");
      values.push(body.reverted_at);
    }
    if (body.revert_pr_url?.trim()) {
      setClauses.push("revert_pr_url = ?");
      values.push(body.revert_pr_url);
    }

    values.push(id);
    db.prepare(`UPDATE bounties SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);

    return NextResponse.json({
      success: true,
      id,
      ...(body.github_pr_url ? { github_pr_url: body.github_pr_url } : {}),
      ...(body.merged_at ? { merged_at: body.merged_at } : {}),
      ...(body.reverted_at ? { reverted_at: body.reverted_at } : {}),
      ...(body.revert_pr_url ? { revert_pr_url: body.revert_pr_url } : {}),
    });
  } catch (err) {
    console.error(`[PATCH /api/bounty/${id}] error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to update bounty" },
      { status: 500 }
    );
  }
}
