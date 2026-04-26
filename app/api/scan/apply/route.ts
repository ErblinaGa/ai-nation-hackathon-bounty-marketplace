/**
 * [app/api/scan/apply] Apply selected scan candidates — creates GitHub issues
 * and posts bounties for each.
 *
 * POST { candidate_ids: string[], api_base?: string }
 *   → for each candidate:
 *     1. Create GitHub issue (gh issue create)
 *     2. POST /api/bounty (codebase task)
 *     3. Update scan_candidates: status=APPLIED, bounty_id, issue_number
 *   → returns { applied: [{candidate_id, bounty_id, issue_number, issue_url}] }
 */
import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCandidatesByIds, markApplied } from "@/lib/scan_candidates";
import type { ScanCandidateRow } from "@/lib/scan_candidates";
import { walkCodebase } from "@/lib/scanner";
import { readFileSync } from "node:fs";

const DEMO_POSTER_PUBKEY = "02demo_poster_pubkey";

// Default auditor config matching gh_bounty defaults
const DEFAULT_AUDITOR_CONFIG = {
  model: "claude-sonnet-4-6",
  weights: {
    diff_size: 0.6,
    convention_match: 0.8,
    no_new_deps: 0.7,
    security: 1.0,
    price: 0.5,
    bidder_track_record: 0.4,
  },
  threshold: 0.5,
  max_extensions: 2,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * [apply][createGitHubIssue] Creates a GitHub issue via gh CLI.
 * Returns { number, url } on success.
 */
function createGitHubIssue(
  repo: string,
  title: string,
  body: string,
): { number: number; url: string } {
  let raw: string;
  try {
    raw = execFileSync(
      "gh",
      [
        "issue",
        "create",
        "--repo",
        repo,
        "--title",
        title,
        "--body",
        body,
        "--label",
        "bounty",
      ],
      { encoding: "utf-8", timeout: 30_000, stdio: "pipe" },
    ).trim();
  } catch (err) {
    // Label might not exist — retry without label
    try {
      raw = execFileSync(
        "gh",
        [
          "issue",
          "create",
          "--repo",
          repo,
          "--title",
          title,
          "--body",
          body,
        ],
        { encoding: "utf-8", timeout: 30_000, stdio: "pipe" },
      ).trim();
    } catch (err2) {
      throw new Error(
        `[apply][createGitHubIssue] gh issue create failed: ${err2 instanceof Error ? err2.message : String(err2)}`,
      );
    }
  }

  // gh prints the URL — extract number from URL
  const urlLine = raw.split("\n").pop() ?? raw;
  const match = urlLine.match(/\/issues\/(\d+)$/);
  const number = match ? parseInt(match[1], 10) : 0;

  return { number, url: urlLine };
}

/**
 * [apply][cloneAndBuildContext] Clones repo and builds context_files from
 * the files_affected list (falls back to top 10 if empty).
 */
async function cloneAndBuildContext(
  repo: string,
  filesAffected: string[],
): Promise<{
  repoDir: string;
  tmpDir: string;
  contextFiles: Array<{ path: string; content: string }>;
  commitSha: string;
}> {
  const tmpDir = mkdtempSync(join(tmpdir(), "lb-apply-"));
  const repoDir = join(tmpDir, "repo");

  execFileSync("gh", ["repo", "clone", repo, repoDir, "--", "--depth=1", "--quiet"], {
    timeout: 60_000,
    stdio: "pipe",
  });

  const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoDir,
    encoding: "utf-8",
  }).trim();

  // Build context: use files_affected if provided, otherwise top 10 from walk
  let pathsToInclude = filesAffected.filter((p) => p.length > 0);

  if (pathsToInclude.length === 0) {
    const allFiles = await walkCodebase(repoDir);
    pathsToInclude = allFiles.slice(0, 10);
  }

  const contextFiles: Array<{ path: string; content: string }> = [];
  for (const relPath of pathsToInclude) {
    const absPath = join(repoDir, relPath);
    try {
      const content = readFileSync(absPath, "utf-8");
      contextFiles.push({ path: relPath, content });
    } catch {
      // File may not exist in clone (candidate hallucinated path) — skip
    }
  }

  return { repoDir, tmpDir, contextFiles, commitSha };
}

/**
 * [apply][postBounty] Posts bounty to /api/bounty for a candidate.
 */
async function postBounty(
  apiBase: string,
  candidate: ScanCandidateRow,
  issueNumber: number,
  commitSha: string,
  contextFiles: Array<{ path: string; content: string }>,
): Promise<{ bounty_id: string; status: string }> {
  const filesAffected: string[] = candidate.files_affected
    ? (JSON.parse(candidate.files_affected) as string[])
    : [];

  const taskDescription = `${candidate.title}\n\n${candidate.body}\n\nFiles to modify: ${filesAffected.join(", ")}`;

  const requestBody = {
    poster_pubkey: DEMO_POSTER_PUBKEY,
    title: candidate.title,
    description: taskDescription,
    language: "typescript",
    task_type: "codebase",
    task_payload: {
      codebase_id: candidate.repo.replace("/", "-"),
      context_files: contextFiles,
      test_command: "npm test -- --run",
      task_description: taskDescription,
    },
    test_suite: `// scan bounty — github issue #${issueNumber}`,
    max_bounty_sats: candidate.suggested_sats ?? 10_000,
    deadline_minutes: 10,
    github_repo: candidate.repo,
    github_issue_number: issueNumber,
    github_commit_sha: commitSha,
    auditor_config: DEFAULT_AUDITOR_CONFIG,
  };

  let response: Response;
  try {
    response = await fetch(`${apiBase}/api/bounty`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    throw new Error(
      `[apply][postBounty] Network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    result = {};
  }

  if (!response.ok) {
    const errMsg = (result as { error?: string })?.error ?? `HTTP ${response.status}`;
    throw new Error(`[apply][postBounty] API error: ${errMsg}`);
  }

  const r = result as { bounty_id: string; status: string };
  return { bounty_id: r.bounty_id, status: r.status };
}

// ---------------------------------------------------------------------------
// POST /api/scan/apply
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: { candidate_ids?: string[]; api_base?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.candidate_ids) || body.candidate_ids.length === 0) {
    return NextResponse.json(
      { success: false, error: "candidate_ids must be a non-empty array" },
      { status: 400 },
    );
  }

  const candidateIds = body.candidate_ids.filter(
    (id) => typeof id === "string" && id.length > 0,
  );

  if (candidateIds.length === 0) {
    return NextResponse.json(
      { success: false, error: "No valid candidate IDs provided" },
      { status: 400 },
    );
  }

  // Determine API base — infer from request if not provided
  const apiBase =
    body.api_base?.replace(/\/$/, "") ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  // Fetch candidates from DB
  let candidates: ScanCandidateRow[];
  try {
    candidates = getCandidatesByIds(candidateIds);
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: `Failed to fetch candidates: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }

  if (candidates.length === 0) {
    return NextResponse.json(
      { success: false, error: "No candidates found for the given IDs" },
      { status: 404 },
    );
  }

  // Group candidates by repo to minimize clone operations
  const byRepo = new Map<string, ScanCandidateRow[]>();
  for (const c of candidates) {
    const list = byRepo.get(c.repo) ?? [];
    list.push(c);
    byRepo.set(c.repo, list);
  }

  const applied: Array<{
    candidate_id: string;
    bounty_id: string;
    issue_number: number;
    issue_url: string;
    error?: string;
  }> = [];

  // Process each repo group
  for (const [repo, repoCandidates] of byRepo.entries()) {
    let tmpDir: string | null = null;
    let cloneResult: Awaited<ReturnType<typeof cloneAndBuildContext>> | null = null;

    // Clone once per repo — pick files_affected from first candidate as representative
    const allFilesAffected = Array.from(
      new Set(
        repoCandidates.flatMap((c) =>
          c.files_affected ? (JSON.parse(c.files_affected) as string[]) : [],
        ),
      ),
    );

    try {
      cloneResult = await cloneAndBuildContext(repo, allFilesAffected);
      tmpDir = cloneResult.tmpDir;
    } catch (err) {
      // All candidates for this repo fail
      for (const c of repoCandidates) {
        applied.push({
          candidate_id: c.id,
          bounty_id: "",
          issue_number: 0,
          issue_url: "",
          error: `Clone failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      continue;
    }

    for (const candidate of repoCandidates) {
      if (candidate.status === "APPLIED") {
        applied.push({
          candidate_id: candidate.id,
          bounty_id: candidate.bounty_id ?? "",
          issue_number: candidate.issue_number ?? 0,
          issue_url: `https://github.com/${repo}/issues/${candidate.issue_number}`,
        });
        continue;
      }

      try {
        // 1. Create GitHub issue
        const issue = createGitHubIssue(repo, candidate.title, candidate.body);

        // 2. Build context files for this specific candidate
        const filesAffected: string[] = candidate.files_affected
          ? (JSON.parse(candidate.files_affected) as string[])
          : [];

        let contextFiles: Array<{ path: string; content: string }> = [];
        if (cloneResult) {
          if (filesAffected.length > 0) {
            // Read specific files for this candidate
            for (const relPath of filesAffected) {
              const absPath = join(cloneResult.repoDir, relPath);
              try {
                const content = readFileSync(absPath, "utf-8");
                contextFiles.push({ path: relPath, content });
              } catch {
                // skip missing files
              }
            }
          } else {
            contextFiles = cloneResult.contextFiles;
          }
        }

        // 3. Post bounty
        const bountyResult = await postBounty(
          apiBase,
          candidate,
          issue.number,
          cloneResult?.commitSha ?? "",
          contextFiles,
        );

        // 4. Mark applied in DB
        try {
          markApplied(candidate.id, bountyResult.bounty_id, issue.number);
        } catch (dbErr) {
          console.error(
            `[POST /api/scan/apply] Failed to mark candidate ${candidate.id} as applied:`,
            dbErr,
          );
          // Non-fatal — continue
        }

        applied.push({
          candidate_id: candidate.id,
          bounty_id: bountyResult.bounty_id,
          issue_number: issue.number,
          issue_url: issue.url,
        });
      } catch (err) {
        applied.push({
          candidate_id: candidate.id,
          bounty_id: "",
          issue_number: 0,
          issue_url: "",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Cleanup clone
    if (tmpDir) {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // non-fatal
      }
    }
  }

  const successCount = applied.filter((a) => !a.error && a.bounty_id).length;

  return NextResponse.json({
    success: successCount > 0,
    data: { applied },
  });
}
