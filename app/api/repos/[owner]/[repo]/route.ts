// GET /api/repos/:owner/:repo — repo detail + recent bounties from this repo

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { RepoConnection, BountyListItem } from "@/lib/types";

interface RepoDetailResponse {
  connection: RepoConnection;
  recent_bounties: BountyListItem[];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { owner: string; repo: string } },
) {
  const { owner, repo } = params;

  if (!owner?.trim() || !repo?.trim()) {
    return NextResponse.json(
      { success: false, error: "owner and repo are required" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();

    const connection = db
      .prepare(
        `SELECT id, owner, repo, github_username, default_branch, description, connected_at
         FROM repo_connections WHERE owner = ? AND repo = ?`,
      )
      .get(owner, repo) as RepoConnection | undefined;

    if (!connection) {
      return NextResponse.json(
        { success: false, error: `Repo ${owner}/${repo} is not connected` },
        { status: 404 },
      );
    }

    // Recent bounties from this repo (last 20)
    const bountyRows = db
      .prepare(
        `SELECT
           b.id, b.title, b.description, b.language, b.task_type,
           b.max_bounty_sats, b.deadline_at, b.status, b.created_at,
           b.github_repo, b.github_issue_number,
           COUNT(bids.id) as bid_count,
           SUM(CASE WHEN bids.test_status = 'PASS' THEN 1 ELSE 0 END) as passing_bid_count
         FROM bounties b
         LEFT JOIN bids ON bids.bounty_id = b.id
         WHERE b.github_repo = ?
         GROUP BY b.id
         ORDER BY b.created_at DESC
         LIMIT 20`,
      )
      .all(`${owner}/${repo}`) as Array<{
      id: string;
      title: string;
      description: string;
      language: string;
      task_type: string;
      max_bounty_sats: number;
      deadline_at: string;
      status: string;
      created_at: string;
      github_repo: string | null;
      github_issue_number: number | null;
      bid_count: number;
      passing_bid_count: number;
    }>;

    const recent_bounties: BountyListItem[] = bountyRows.map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      language: b.language as BountyListItem["language"],
      task_type: (b.task_type ?? "snippet") as BountyListItem["task_type"],
      max_bounty_sats: b.max_bounty_sats,
      deadline_at: b.deadline_at,
      status: b.status as BountyListItem["status"],
      bid_count: b.bid_count ?? 0,
      passing_bid_count: b.passing_bid_count ?? 0,
      created_at: b.created_at,
      github_repo: b.github_repo,
      github_issue_number: b.github_issue_number,
    }));

    const response: RepoDetailResponse = { connection, recent_bounties };
    return NextResponse.json(response);
  } catch (err) {
    console.error(`[GET /api/repos/${owner}/${repo}] error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch repo detail" },
      { status: 500 },
    );
  }
}
