/**
 * [app/api/scan] Scan endpoint — triggers codebase scanner and persists candidates.
 *
 * POST { repo: "owner/repo", max_candidates?: number }
 *   → triggers scanRepo, persists to DB, returns { scan_id, candidates }
 *
 * GET ?scan_id=X
 *   → returns candidates for a scan
 *
 * GET ?repo=owner/repo&latest=true
 *   → returns candidates for the most recent scan of that repo
 */
import { NextRequest, NextResponse } from "next/server";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scanRepo } from "@/lib/scanner";
import {
  saveCandidates,
  getCandidates,
  getLatestScanId,
} from "@/lib/scan_candidates";

// ---------------------------------------------------------------------------
// POST /api/scan
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: { repo?: string; max_candidates?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body.repo || typeof body.repo !== "string" || !body.repo.includes("/")) {
    return NextResponse.json(
      { success: false, error: "repo is required and must be 'owner/repo' format" },
      { status: 400 },
    );
  }

  const maxCandidates =
    typeof body.max_candidates === "number" && body.max_candidates > 0
      ? Math.min(body.max_candidates, 10)
      : 8;

  const repo = body.repo.trim();

  // Clone repo to temp dir
  const tmpDir = mkdtempSync(join(tmpdir(), "lb-scan-"));
  const repoDir = join(tmpDir, "repo");

  try {
    console.log(`[POST /api/scan] Cloning ${repo}...`);
    try {
      execFileSync("gh", ["repo", "clone", repo, repoDir, "--", "--depth=1", "--quiet"], {
        timeout: 60_000,
        stdio: "pipe",
      });
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to clone repo ${repo}: ${err instanceof Error ? err.message : String(err)}`,
        },
        { status: 422 },
      );
    }

    // Run scanner
    let candidates;
    try {
      candidates = await scanRepo(repoDir, repo, maxCandidates);
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          error: `Scan failed: ${err instanceof Error ? err.message : String(err)}`,
        },
        { status: 500 },
      );
    }

    // Persist
    try {
      saveCandidates(candidates);
    } catch (err) {
      console.error("[POST /api/scan] Failed to save candidates:", err);
      // Non-fatal — return candidates even if DB write fails
    }

    const scanId = candidates[0]?.scan_id ?? `scan_empty_${Date.now()}`;

    return NextResponse.json(
      {
        success: true,
        data: {
          scan_id: scanId,
          repo,
          candidates: candidates.map((c) => ({
            ...c,
            files_affected: c.files_affected,
          })),
        },
      },
      { status: 201 },
    );
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // non-fatal cleanup
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/scan?scan_id=X  or  ?repo=X&latest=true
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const scanId = searchParams.get("scan_id");
  const repo = searchParams.get("repo");
  const latest = searchParams.get("latest");

  if (scanId) {
    try {
      const rows = getCandidates(scanId);
      return NextResponse.json({
        success: true,
        data: {
          scan_id: scanId,
          candidates: rows.map((r) => ({
            ...r,
            files_affected: r.files_affected ? JSON.parse(r.files_affected) : [],
          })),
        },
      });
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch candidates: ${err instanceof Error ? err.message : String(err)}`,
        },
        { status: 500 },
      );
    }
  }

  if (repo && latest === "true") {
    try {
      const latestScanId = getLatestScanId(repo);
      if (!latestScanId) {
        return NextResponse.json(
          { success: false, error: `No scans found for repo: ${repo}` },
          { status: 404 },
        );
      }
      const rows = getCandidates(latestScanId);
      return NextResponse.json({
        success: true,
        data: {
          scan_id: latestScanId,
          repo,
          candidates: rows.map((r) => ({
            ...r,
            files_affected: r.files_affected ? JSON.parse(r.files_affected) : [],
          })),
        },
      });
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch latest scan: ${err instanceof Error ? err.message : String(err)}`,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { success: false, error: "Provide ?scan_id=X or ?repo=owner/repo&latest=true" },
    { status: 400 },
  );
}
