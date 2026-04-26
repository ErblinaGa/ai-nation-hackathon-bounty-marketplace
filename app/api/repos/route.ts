// POST /api/repos — register a GitHub repo connection
// GET  /api/repos — list all connected repos

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import type { RepoConnection } from "@/lib/types";

// ---------------------------------------------------------------------------
// GET — list all connected repos
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest) {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, owner, repo, github_username, default_branch, description, connected_at
         FROM repo_connections
         ORDER BY connected_at DESC`,
      )
      .all() as Array<{
      id: string;
      owner: string;
      repo: string;
      github_username: string;
      default_branch: string;
      description: string | null;
      connected_at: string;
    }>;

    const connections: RepoConnection[] = rows.map((r) => ({
      id: r.id,
      owner: r.owner,
      repo: r.repo,
      github_username: r.github_username,
      default_branch: r.default_branch,
      description: r.description,
      connected_at: r.connected_at,
    }));

    return NextResponse.json(connections);
  } catch (err) {
    console.error("[GET /api/repos] error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to list repos" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST — register a new repo connection
// ---------------------------------------------------------------------------

interface PostRepoBody {
  owner: string;
  repo: string;
  github_username: string;
  default_branch?: string;
  description?: string | null;
}

export async function POST(req: NextRequest) {
  let body: PostRepoBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  // Input validation
  if (!body.owner?.trim()) {
    return NextResponse.json(
      { success: false, error: "owner is required" },
      { status: 400 },
    );
  }
  if (!body.repo?.trim()) {
    return NextResponse.json(
      { success: false, error: "repo is required" },
      { status: 400 },
    );
  }
  if (!body.github_username?.trim()) {
    return NextResponse.json(
      { success: false, error: "github_username is required" },
      { status: 400 },
    );
  }

  // Validate owner/repo format (no slashes inside)
  if (body.owner.includes("/") || body.repo.includes("/")) {
    return NextResponse.json(
      { success: false, error: "owner and repo must not contain slashes" },
      { status: 400 },
    );
  }

  const id = `repo_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const defaultBranch = body.default_branch?.trim() || "main";
  const description = body.description ?? null;

  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO repo_connections (id, owner, repo, github_username, default_branch, description)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(owner, repo) DO UPDATE SET
         github_username = excluded.github_username,
         default_branch  = excluded.default_branch,
         description     = excluded.description`,
    ).run(id, body.owner, body.repo, body.github_username, defaultBranch, description);

    // Fetch the actual row (may have been the existing one on conflict update)
    const row = db
      .prepare(
        `SELECT id, owner, repo, github_username, default_branch, description, connected_at
         FROM repo_connections WHERE owner = ? AND repo = ?`,
      )
      .get(body.owner, body.repo) as RepoConnection;

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("[POST /api/repos] db error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to save repo connection" },
      { status: 500 },
    );
  }
}
