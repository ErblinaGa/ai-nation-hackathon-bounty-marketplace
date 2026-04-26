// GET /api/bounties — list bounties with optional filtering
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureJobsRunning } from "@/lib/jobs";
import type { BountyListItem } from "@/lib/types";

export async function GET(req: NextRequest) {
  ensureJobsRunning();

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");
  const languageFilter = searchParams.get("language");
  const taskTypeFilter = searchParams.get("task_type");
  const minBountyParam = searchParams.get("min_bounty");

  if (taskTypeFilter && !["snippet", "codebase", "bug_bounty"].includes(taskTypeFilter)) {
    return NextResponse.json(
      { success: false, error: "task_type must be one of: snippet, codebase, bug_bounty" },
      { status: 400 }
    );
  }

  const minBounty = minBountyParam ? parseInt(minBountyParam, 10) : null;
  if (minBountyParam && (isNaN(minBounty!) || minBounty! < 0)) {
    return NextResponse.json(
      { success: false, error: "min_bounty must be a non-negative integer" },
      { status: 400 }
    );
  }

  try {
    const db = getDb();

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (statusFilter) {
      conditions.push("b.status = ?");
      params.push(statusFilter);
    }
    if (languageFilter) {
      conditions.push("b.language = ?");
      params.push(languageFilter);
    }
    if (taskTypeFilter) {
      conditions.push("b.task_type = ?");
      params.push(taskTypeFilter);
    }
    if (minBounty !== null) {
      conditions.push("b.max_bounty_sats >= ?");
      params.push(minBounty);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = db
      .prepare(
        `SELECT
           b.id, b.title, b.description, b.language, b.task_type, b.max_bounty_sats,
           b.deadline_at, b.status, b.created_at,
           b.github_repo, b.github_issue_number,
           COUNT(bd.id) as bid_count,
           SUM(CASE WHEN bd.test_status = 'PASS' THEN 1 ELSE 0 END) as passing_bid_count
         FROM bounties b
         LEFT JOIN bids bd ON bd.bounty_id = b.id
         ${where}
         GROUP BY b.id
         ORDER BY b.created_at DESC`
      )
      .all(...params) as Array<{
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

    const bounties: BountyListItem[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      language: r.language as BountyListItem["language"],
      task_type: (r.task_type ?? "snippet") as BountyListItem["task_type"],
      max_bounty_sats: r.max_bounty_sats,
      deadline_at: r.deadline_at,
      status: r.status as BountyListItem["status"],
      github_repo: r.github_repo,
      github_issue_number: r.github_issue_number,
      bid_count: r.bid_count,
      passing_bid_count: r.passing_bid_count ?? 0,
      created_at: r.created_at,
    }));

    return NextResponse.json({ bounties });
  } catch (err) {
    console.error("[GET /api/bounties] db error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch bounties" },
      { status: 500 }
    );
  }
}
