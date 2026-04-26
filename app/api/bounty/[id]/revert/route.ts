// POST /api/bounty/:id/revert
// Triggers a git revert of the merged PR for a SETTLED+MERGED GitHub bounty.
// Auth: x-pubkey must match poster_pubkey
// Winner keeps sats — this only opens a revert PR on GitHub.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getPubkeyFromRequest } from "@/lib/auth";
import { autoRevert } from "@/lib/github";

const BOUNTY_UI_BASE =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

interface BountyRow {
  id: string;
  poster_pubkey: string;
  status: string;
  github_repo: string | null;
  github_issue_number: number | null;
  github_pr_url: string | null;
  merged_at: string | null;
  reverted_at: string | null;
  revert_pr_url: string | null;
}

export async function POST(
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
        `SELECT id, poster_pubkey, status, github_repo, github_issue_number,
                github_pr_url, merged_at, reverted_at, revert_pr_url
         FROM bounties WHERE id = ?`,
      )
      .get(id) as BountyRow | undefined;

    if (!bounty) {
      return NextResponse.json(
        { success: false, error: "Bounty not found" },
        { status: 404 },
      );
    }

    // Auth: only poster can trigger revert
    if (callerPubkey && callerPubkey !== bounty.poster_pubkey) {
      return NextResponse.json(
        { success: false, error: "Forbidden: only the poster can revert this bounty" },
        { status: 403 },
      );
    }

    if (bounty.status !== "SETTLED") {
      return NextResponse.json(
        {
          success: false,
          error: `Bounty must be SETTLED to revert (current status: ${bounty.status})`,
        },
        { status: 400 },
      );
    }

    if (!bounty.github_repo) {
      return NextResponse.json(
        { success: false, error: "Bounty is not a GitHub-driven bounty (no github_repo)" },
        { status: 400 },
      );
    }

    if (!bounty.github_pr_url) {
      return NextResponse.json(
        { success: false, error: "No PR URL on bounty — cannot determine what to revert" },
        { status: 400 },
      );
    }

    if (!bounty.merged_at) {
      return NextResponse.json(
        { success: false, error: "PR has not been merged yet — merge it first via lb gh-merge" },
        { status: 400 },
      );
    }

    if (bounty.reverted_at) {
      return NextResponse.json(
        {
          success: true,
          already_reverted: true,
          revert_pr_url: bounty.revert_pr_url,
          reverted_at: bounty.reverted_at,
        },
      );
    }

    // Trigger the revert
    const bountyUrl = `${BOUNTY_UI_BASE}/bounty/${id}`;

    let result: { prUrl: string; prNumber: number; branch: string };
    try {
      result = await autoRevert({
        repo: bounty.github_repo,
        mergedPrUrl: bounty.github_pr_url,
        bountyId: id,
        originalIssueNumber: bounty.github_issue_number,
        bountyUrl,
      });
    } catch (err) {
      console.error(`[POST /api/bounty/${id}/revert] autoRevert failed:`, err);
      return NextResponse.json(
        {
          success: false,
          error: `Revert failed: ${err instanceof Error ? err.message : String(err)}`,
        },
        { status: 500 },
      );
    }

    // Record revert fields on bounty
    const revertedAt = new Date().toISOString();
    db.prepare(
      `UPDATE bounties SET reverted_at = ?, revert_pr_url = ? WHERE id = ?`,
    ).run(revertedAt, result.prUrl, id);

    return NextResponse.json({
      success: true,
      revert_pr_url: result.prUrl,
      revert_pr_number: result.prNumber,
      reverted_at: revertedAt,
      branch: result.branch,
    });
  } catch (err) {
    console.error(`[POST /api/bounty/${id}/revert] error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to process revert request" },
      { status: 500 },
    );
  }
}
