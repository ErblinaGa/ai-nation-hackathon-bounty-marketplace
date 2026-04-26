/**
 * [cli/gh_bounty] `lb gh-bounty <owner/repo>#<issue-number>`
 *
 * Flow:
 *  1. Validate repo is connected (GET /api/repos)
 *  2. Fetch issue via gh issue view --json
 *  3. Clone repo to temp dir
 *  4. Read HEAD commit SHA
 *  5. Run context_extractor to rank relevant files
 *  6. Build CodebasePayload + AuditorConfig (default weights)
 *  7. POST /api/bounty with github fields
 *  8. Cleanup temp dir
 *  9. Print bounty_id + invoice + UI link
 */
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ghIssueView, ghRepoClone, requireAuth } from "../github.js";
import { extractContext } from "../context_extractor.js";
import { estimate, midpoint } from "../estimator.js";
import type { AuditorConfig } from "../types.js";

const DEFAULT_API_BASE = "http://localhost:3000";
const DEMO_POSTER_PUBKEY = "02demo_poster_pubkey";
const DEFAULT_MAX_SATS = 5000;
const DEFAULT_DEADLINE_MIN = 10;

// V3 default auditor weights — quality-only, no price.
// MUST match lib/auditor.ts defaults — locked at posting time.
const DEFAULT_AUDITOR_CONFIG: AuditorConfig = {
  model: "claude-sonnet-4-6",
  weights: {
    code_quality: 0.9,
    completeness: 0.9,
    convention_match: 0.8,
    test_appropriateness: 0.7,
    maintainability: 0.7,
    no_new_deps: 0.6,
    security: 1.0,
  },
  threshold: 0.5,
  max_extensions: 2,
};

interface GhBountyOpts {
  api: string;
  maxSats: string;
  deadlineMin: string;
  testCommand: string;
  language: string;
  auto: boolean;
}

/**
 * [cli/gh_bounty][parseRepoIssue] Parses "owner/repo#N" or "owner/repo #N".
 * Returns { owner, repo, issueNumber }.
 */
function parseRepoIssue(arg: string): {
  owner: string;
  repo: string;
  issueNumber: number;
} {
  // Accept "owner/repo#N" or "owner/repo #N"
  const match = arg.match(/^([^/]+)\/([^#\s]+)[#\s]+(\d+)$/);
  if (!match) {
    throw new Error(
      `[gh-bounty] Invalid argument: "${arg}". Expected format: owner/repo#N (e.g. boaharis/lightning-bounty-demo#1)`,
    );
  }
  const [, owner, repo, numStr] = match;
  const issueNumber = parseInt(numStr, 10);
  if (isNaN(issueNumber) || issueNumber <= 0) {
    throw new Error(`[gh-bounty] Issue number must be a positive integer, got: ${numStr}`);
  }
  return { owner, repo, issueNumber };
}

/**
 * [cli/gh_bounty][readHeadSha] Reads current HEAD commit SHA from a cloned repo dir.
 */
function readHeadSha(repoDir: string): string {
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoDir,
      encoding: "utf-8",
    }).trim();
    return sha;
  } catch (err) {
    throw new Error(
      `[gh-bounty][readHeadSha] Failed to read HEAD SHA: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * [cli/gh_bounty][checkRepoConnected] Validates the repo is registered in the marketplace.
 * Returns the connection record if found.
 */
async function checkRepoConnected(
  apiBase: string,
  owner: string,
  repo: string,
): Promise<boolean> {
  try {
    const url = `${apiBase}/api/repos`;
    const response = await fetch(url);
    if (!response.ok) return false;
    const data = (await response.json()) as Array<{ owner: string; repo: string }>;
    return data.some((r) => r.owner === owner && r.repo === repo);
  } catch {
    return false;
  }
}

export async function runGhBounty(
  repoIssueArg: string,
  opts: GhBountyOpts,
): Promise<void> {
  // Auth guard
  await requireAuth();

  const { owner, repo, issueNumber } = parseRepoIssue(repoIssueArg);
  const apiBase = opts.api.replace(/\/$/, "");
  const parsedMaxSats = parseInt(opts.maxSats, 10);
  const deadlineMin = parseInt(opts.deadlineMin, 10);

  // 0 or NaN means "auto-estimate" — validated later after context extraction.
  const useEstimator = isNaN(parsedMaxSats) || parsedMaxSats <= 0;

  if (isNaN(deadlineMin) || deadlineMin <= 0) {
    console.error("[gh-bounty] --deadline-min must be a positive integer");
    process.exit(1);
  }

  console.log(`\nlb gh-bounty`);
  console.log(`  repo     : ${owner}/${repo}`);
  console.log(`  issue    : #${issueNumber}`);
  console.log(`  max sats : ${useEstimator ? "(auto-estimate)" : parsedMaxSats}`);
  console.log(`  deadline : ${deadlineMin} minutes`);
  console.log(`  api      : ${apiBase}`);
  console.log(``);

  // 1. Validate repo is connected
  console.log(`[gh-bounty] Checking repo connection...`);
  const connected = await checkRepoConnected(apiBase, owner, repo);
  if (!connected) {
    console.error(
      `[gh-bounty] Error: ${owner}/${repo} is not connected to the marketplace.`,
    );
    console.error(
      `[gh-bounty] Run first: lb gh-connect ${owner}/${repo}`,
    );
    process.exit(1);
  }
  console.log(`[gh-bounty] Repo connected: OK`);

  // 2. Fetch issue
  console.log(`[gh-bounty] Fetching issue #${issueNumber}...`);
  let issue: Awaited<ReturnType<typeof ghIssueView>>;
  try {
    issue = await ghIssueView(`${owner}/${repo}`, issueNumber);
  } catch (err) {
    console.error(
      `[gh-bounty] Error fetching issue: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
  console.log(`[gh-bounty] Issue: "${issue.title}"`);

  // 3. Clone repo to temp dir
  const tmpDir = mkdtempSync(join(tmpdir(), "lb-gh-clone-"));
  const repoDir = join(tmpDir, "repo");

  try {
    console.log(`[gh-bounty] Cloning ${owner}/${repo} to temp dir...`);
    try {
      await ghRepoClone(`${owner}/${repo}`, repoDir);
    } catch (err) {
      throw new Error(
        `[gh-bounty] Clone failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    console.log(`[gh-bounty] Clone complete: ${repoDir}`);

    // 4. Read HEAD SHA
    const commitSha = readHeadSha(repoDir);
    console.log(`[gh-bounty] HEAD commit: ${commitSha.slice(0, 12)}...`);

    // 5. Extract context files via Claude Haiku
    const taskDescription = `${issue.title}\n\n${issue.body}`;
    console.log(`[gh-bounty] Extracting relevant context files...`);
    let contextFiles: Array<{ path: string; content: string }>;
    try {
      contextFiles = await extractContext(repoDir, taskDescription);
    } catch (err) {
      throw new Error(
        `[gh-bounty] Context extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    console.log(`[gh-bounty] Context files: ${contextFiles.length} files selected`);

    if (contextFiles.length === 0) {
      console.warn("[gh-bounty] Warning: no context files found — posting without codebase context");
    }

    // 5b. Run estimator if --max-sats not provided
    let maxSats: number;
    if (useEstimator) {
      const estimation = await estimate(issue.title, issue.body, contextFiles);
      const suggested = midpoint(estimation);

      if (!opts.auto) {
        console.log(
          `[estimator] Estimated complexity: ${estimation.complexity}. ` +
          `Suggested: ${estimation.suggested_sats_min.toLocaleString()}-${estimation.suggested_sats_max.toLocaleString()} sat. ` +
          `Reasoning: ${estimation.reasoning}`,
        );
        console.log(
          `[estimator] Default to mid-point: ${suggested.toLocaleString()} sat. ` +
          `Override with --max-sats to use a different amount.`,
        );
      }

      maxSats = suggested;
    } else {
      maxSats = parsedMaxSats;
    }

    // 6. Build payload
    const codebasePayload = {
      codebase_id: `${owner}-${repo}`,
      context_files: contextFiles,
      test_command: opts.testCommand,
      task_description: taskDescription,
    };

    const auditorConfig: AuditorConfig = { ...DEFAULT_AUDITOR_CONFIG };

    // 7. POST bounty
    console.log(`[gh-bounty] Posting bounty to ${apiBase}...`);
    const requestBody = {
      poster_pubkey: DEMO_POSTER_PUBKEY,
      title: issue.title,
      description: taskDescription,
      language: opts.language,
      task_type: "codebase",
      task_payload: codebasePayload,
      test_suite: `// github issue #${issueNumber} — run: ${opts.testCommand}`,
      max_bounty_sats: maxSats,
      deadline_minutes: deadlineMin,
      // V2 GitHub fields
      github_repo: `${owner}/${repo}`,
      github_issue_number: issueNumber,
      github_commit_sha: commitSha,
      auditor_config: auditorConfig,
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
        `[gh-bounty] Network error posting bounty: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok) {
      const errMsg =
        (result as { error?: string })?.error ?? `HTTP ${response.status}`;
      throw new Error(`[gh-bounty] API error: ${errMsg}`);
    }

    const bountyResult = result as {
      bounty_id: string;
      poster_stake_invoice: string;
      poster_stake_payment_hash: string;
      deadline_at: string;
      status: string;
    };

    const bountyUrl = `${apiBase}/bounty/${bountyResult.bounty_id}`;

    console.log(`\nBounty posted from GitHub issue!`);
    console.log(`  Bounty ID  : ${bountyResult.bounty_id}`);
    console.log(`  Issue      : ${owner}/${repo}#${issueNumber}`);
    console.log(`  Commit SHA : ${commitSha.slice(0, 12)}`);
    console.log(`  Status     : ${bountyResult.status}`);
    console.log(`  Deadline   : ${bountyResult.deadline_at}`);
    console.log(`  Invoice    : ${bountyResult.poster_stake_invoice}`);
    console.log(`  Demo URL   : ${bountyUrl}`);
    console.log(``);
    console.log(`Context files (${contextFiles.length}):`);
    for (const f of contextFiles) {
      console.log(`  - ${f.path} (${f.content.length} chars)`);
    }
  } finally {
    // 8. Cleanup temp clone
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Non-fatal cleanup failure
    }
  }
}
