/**
 * [lib/github] Server-side wrappers around the gh CLI.
 * Called by lib/jobs.ts auto-PR logic after auditor settles a GitHub bounty.
 *
 * Auth model: gh CLI is authenticated globally as the operator user.
 * For dev/demo: boaharis. For production: needs per-user auth flow (V2.5).
 *
 * All shell-outs use child_process.execFile — no shell injection surface.
 */
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeNewFileDiffs } from "./sandbox";

const execFileAsync = promisify(execFile);
const GH_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

async function gh(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("gh", args, {
      timeout: GH_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[lib/github][gh ${args[0]}] gh CLI error: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Clone
// ---------------------------------------------------------------------------

/**
 * [lib/github][cloneRepo] Clones `owner/repo` at the given SHA into `dest`.
 * Performs a shallow clone then checks out the exact commit.
 * dest must not yet exist.
 */
export async function cloneRepo(
  repo: string,
  sha: string,
  dest: string,
): Promise<void> {
  // Shallow clone (depth=1 is fast but may miss the exact SHA if it's old)
  // For demo purposes: shallow at HEAD is fine (sha is always the latest commit)
  await gh(["repo", "clone", repo, dest, "--", "--depth=1", "--quiet"]);

  // Verify we got the right commit or check it out
  try {
    execFileSync("git", ["checkout", sha], {
      cwd: dest,
      stdio: "pipe",
    });
  } catch {
    // If sha isn't reachable from shallow clone, fetch it explicitly
    try {
      execFileSync("git", ["fetch", "--depth=1", "origin", sha], {
        cwd: dest,
        stdio: "pipe",
      });
      execFileSync("git", ["checkout", sha], {
        cwd: dest,
        stdio: "pipe",
      });
    } catch {
      // Fallback: stay at HEAD (shallow clone most recent commit — adequate for demo)
      console.warn(`[lib/github][cloneRepo] Could not checkout exact SHA ${sha.slice(0, 12)}, staying at HEAD`);
    }
  }
}

// ---------------------------------------------------------------------------
// Diff application
// ---------------------------------------------------------------------------

/**
 * [lib/github][applyDiff] Applies a unified diff to a git working tree.
 * Tries `git apply --whitespace=fix` first, falls back to `patch -p1`.
 */
export function applyDiff(dir: string, diff: string): void {
  const patchPath = join(dir, ".lb-patch.diff");
  // Normalize new-file diff headers before applying (LLMs often produce
  // `--- a/<path>` for new files instead of `--- /dev/null`).
  const withFixedHeaders = normalizeNewFileDiffs(diff, dir);
  // LLM diffs often miss the trailing newline that POSIX patch tools require.
  const normalized = withFixedHeaders.endsWith("\n") ? withFixedHeaders : withFixedHeaders + "\n";
  writeFileSync(patchPath, normalized, "utf-8");

  // Try patch CLI first (more lenient with LLM hunk-count drift), then git apply variants.
  const attempts: Array<{ cmd: string; args: string[] }> = [
    { cmd: "patch", args: ["-p1", "-l", "--fuzz=3", "--input", patchPath] },
    { cmd: "patch", args: ["-p1", "-l", "--fuzz=5", "--ignore-whitespace", "--input", patchPath] },
    { cmd: "git", args: ["apply", "--whitespace=fix", "--recount", patchPath] },
    { cmd: "git", args: ["apply", "--whitespace=fix", "--recount", "--ignore-whitespace", "--ignore-space-change", patchPath] },
  ];

  let lastErr: unknown = null;
  for (const { cmd, args } of attempts) {
    try {
      execFileSync(cmd, args, { cwd: dir, stdio: "pipe" });
      try { rmSync(patchPath); } catch { /* non-fatal */ }
      return;
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(
    `[lib/github][applyDiff] Failed to apply diff after ${attempts.length} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

// ---------------------------------------------------------------------------
// Branch push
// ---------------------------------------------------------------------------

/**
 * [lib/github][pushBranch] Commits all staged changes and pushes the branch.
 */
export function pushBranch(
  dir: string,
  branch: string,
  commitMessage: string,
): void {
  execFileSync("git", ["checkout", "-b", branch], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["add", "-A"], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["commit", "--no-gpg-sign", "-m", commitMessage], {
    cwd: dir,
    stdio: "pipe",
  });
  // --force is safe here: the branch namespace lb-bounty/<id> is unique per bounty,
  // and we're the only writer. --force avoids races with prior failed attempts.
  execFileSync("git", ["push", "--force", "origin", branch], { cwd: dir, stdio: "pipe" });
}

// ---------------------------------------------------------------------------
// PR creation
// ---------------------------------------------------------------------------

export interface OpenPROptions {
  repo: string;
  branch: string;
  base: string;
  title: string;
  body: string;
}

export interface OpenPRResult {
  url: string;
  number: number;
}

/**
 * [lib/github][openPR] Opens a pull request via `gh pr create`.
 */
export async function openPR(opts: OpenPROptions): Promise<OpenPRResult> {
  // gh pr create prints the PR URL to stdout (one line).
  // After creation we use `gh pr view <url> --json url,number` to get structured info.
  const createUrl = (await gh([
    "pr",
    "create",
    "--repo",
    opts.repo,
    "--head",
    opts.branch,
    "--base",
    opts.base,
    "--title",
    opts.title,
    "--body",
    opts.body,
  ])).trim().split("\n").pop() || "";

  if (!createUrl.startsWith("http")) {
    return { url: createUrl, number: 0 };
  }

  // Fetch PR number from the URL via gh pr view
  try {
    const viewRaw = await gh(["pr", "view", createUrl, "--json", "url,number"]);
    return JSON.parse(viewRaw) as OpenPRResult;
  } catch (err) {
    throw new Error(
      `[lib/github][openPR] Failed to parse PR JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Issue comment
// ---------------------------------------------------------------------------

/**
 * [lib/github][commentOnIssue] Posts a comment on a GitHub issue.
 */
export async function commentOnIssue(
  repo: string,
  issueNumber: number,
  body: string,
): Promise<void> {
  await gh([
    "issue",
    "comment",
    String(issueNumber),
    "--repo",
    repo,
    "--body",
    body,
  ]);
}

// ---------------------------------------------------------------------------
// Full auto-PR flow (called by jobs.ts after auditor settles a GitHub bounty)
// ---------------------------------------------------------------------------

export interface AutoPRInput {
  repo: string;             // "owner/repo"
  sha: string;              // commit to apply diff against
  bountyId: string;
  issueNumber: number | null;
  issueTitle: string;
  diff: string;
  bidId: string;
  bidderPubkey: string;
  askedPriceSats: number;
  auditorNotes: string;
  auditorReasoning: string;
  testOutput: string | null;
  bountyUrl: string;
}

export interface AutoPRResult {
  prUrl: string;
  prNumber: number;
  branch: string;
}

// ---------------------------------------------------------------------------
// Auto-revert flow (called by /api/bounty/[id]/revert route after SETTLED+MERGED)
// ---------------------------------------------------------------------------

export interface AutoRevertInput {
  repo: string;           // "owner/repo"
  mergedPrUrl: string;    // URL of the original merged PR
  bountyId: string;
  originalIssueNumber: number | null;
  bountyUrl: string;
}

export interface AutoRevertResult {
  prUrl: string;
  prNumber: number;
  branch: string;
}

/**
 * [lib/github][autoRevert] Reverts a merged PR by:
 *  1. Fetching the merge commit SHA via gh pr view
 *  2. Cloning repo at HEAD
 *  3. Running git revert <merge-commit-sha>
 *  4. Pushing a new branch and opening a revert PR
 */
export async function autoRevert(input: AutoRevertInput): Promise<AutoRevertResult> {
  const branch = `revert-bnty-${input.bountyId.slice(0, 12)}`;
  const tmpDir = mkdtempSync(join(tmpdir(), "lb-revert-"));
  const repoDir = join(tmpDir, "repo");

  try {
    // 1. Get merge commit SHA from the original PR
    const viewRaw = await gh([
      "pr",
      "view",
      input.mergedPrUrl,
      "--json",
      "mergeCommit,number",
    ]);

    let mergeCommitSha: string | null = null;
    let originalPrNumber: number | null = null;
    try {
      const parsed = JSON.parse(viewRaw) as {
        mergeCommit?: { oid?: string };
        number?: number;
      };
      mergeCommitSha = parsed.mergeCommit?.oid ?? null;
      originalPrNumber = parsed.number ?? null;
    } catch {
      throw new Error(`[lib/github][autoRevert] Failed to parse gh pr view output: ${viewRaw}`);
    }

    if (!mergeCommitSha) {
      throw new Error(
        `[lib/github][autoRevert] Could not find merge commit SHA for PR: ${input.mergedPrUrl}`,
      );
    }

    // 2. Clone repo at HEAD (depth=50 to include the merge commit)
    await gh(["repo", "clone", input.repo, repoDir, "--", "--depth=50", "--quiet"]);

    // 3. Set git identity for the revert commit
    execFileSync("git", ["config", "user.email", "lb-bot@lightning-bounties.dev"], {
      cwd: repoDir,
      stdio: "pipe",
    });
    execFileSync("git", ["config", "user.name", "Lightning Bounties Bot"], {
      cwd: repoDir,
      stdio: "pipe",
    });

    // 4. Create revert branch
    execFileSync("git", ["checkout", "-b", branch], { cwd: repoDir, stdio: "pipe" });

    // 5. Revert — try -m 1 (merge commit) then plain (squash/regular commit)
    let revertOk = false;
    try {
      execFileSync(
        "git",
        ["revert", "--no-edit", "-m", "1", mergeCommitSha],
        { cwd: repoDir, stdio: "pipe" },
      );
      revertOk = true;
    } catch {
      // squash merge → not a merge commit
    }
    if (!revertOk) {
      execFileSync(
        "git",
        ["revert", "--no-edit", mergeCommitSha],
        { cwd: repoDir, stdio: "pipe" },
      );
    }

    // 6. Push branch
    execFileSync("git", ["push", "--force", "origin", branch], { cwd: repoDir, stdio: "pipe" });

    // 7. Open revert PR
    const prBody = [
      `## Revert: Lightning Bounty ${input.bountyId}`,
      ``,
      `This reverts the changes introduced by the winning bid in bounty \`${input.bountyId}\`.`,
      ``,
      `**Original PR:** ${input.mergedPrUrl}`,
      input.originalIssueNumber ? `**Original Issue:** #${input.originalIssueNumber}` : "",
      `**Bounty:** ${input.bountyUrl}`,
      ``,
      `> Note: Winner keeps the sats. This revert does not affect the Lightning settlement.`,
      ``,
      `---`,
      `*Opened automatically by Lightning Bounty Marketplace*`,
    ]
      .filter(Boolean)
      .join("\n");

    const pr = await openPR({
      repo: input.repo,
      branch,
      base: "main",
      title: `Revert: marketplace bounty ${input.bountyId.slice(0, 12)}`,
      body: prBody,
    });

    // Comment on the original PR (non-fatal)
    if (originalPrNumber) {
      try {
        await gh([
          "pr",
          "comment",
          String(originalPrNumber),
          "--repo",
          input.repo,
          "--body",
          `A revert PR has been opened: ${pr.url}`,
        ]);
      } catch {
        console.warn(`[lib/github][autoRevert] Could not comment on original PR #${originalPrNumber}`);
      }
    }

    return { prUrl: pr.url, prNumber: pr.number, branch };
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // non-fatal
    }
  }
}

/**
 * [lib/github][autoPR] Full auto-PR pipeline:
 *  1. Clone repo at SHA into temp dir
 *  2. Apply winning diff
 *  3. Push new branch
 *  4. Open PR
 *  5. (Optional) comment on issue
 *  6. Cleanup
 *
 * Idempotent-safe: caller must check github_pr_url IS NULL before calling.
 */
export async function autoPR(input: AutoPRInput): Promise<AutoPRResult> {
  const [owner, repoName] = input.repo.split("/");
  const branch = `lb-bounty/${input.bountyId.slice(0, 12)}`;
  const tmpDir = mkdtempSync(join(tmpdir(), "lb-autopr-"));
  const repoDir = join(tmpDir, "repo");

  try {
    await cloneRepo(input.repo, input.sha, repoDir);
    applyDiff(repoDir, input.diff);
    pushBranch(
      repoDir,
      branch,
      `marketplace bounty: ${input.issueTitle}${input.issueNumber ? ` (#${input.issueNumber})` : ""}`,
    );

    const prBody = [
      `## Lightning Bounty: ${input.issueTitle}`,
      ``,
      `Resolved via [Lightning Bounty Marketplace](${input.bountyUrl}).`,
      ``,
      `**Winning bid:** \`${input.bidId}\``,
      `**Bidder:** \`${input.bidderPubkey.slice(0, 12)}...\``,
      `**Price:** ${input.askedPriceSats} sats`,
      ``,
      input.auditorNotes ? `**Auditor summary:** ${input.auditorNotes}` : "",
      input.auditorReasoning ? `\n**Auditor reasoning:** ${input.auditorReasoning}` : "",
      input.testOutput
        ? `\n<details><summary>Test output</summary>\n\n\`\`\`\n${input.testOutput.slice(0, 2000)}\n\`\`\`\n</details>`
        : "",
      ``,
      `---`,
      `*Opened automatically by Lightning Bounty Marketplace*`,
    ]
      .filter(Boolean)
      .join("\n");

    const pr = await openPR({
      repo: input.repo,
      branch,
      base: "main",
      title: `marketplace bounty: ${input.issueTitle}`,
      body: prBody,
    });

    // Post comment on the original issue linking back to the PR
    if (input.issueNumber) {
      try {
        await commentOnIssue(
          input.repo,
          input.issueNumber,
          `A fix has been submitted via the Lightning Bounty Marketplace. PR: ${pr.url}\n\nView bounty details: ${input.bountyUrl}`,
        );
      } catch {
        // Non-fatal — commenting can fail without blocking the PR
        console.warn(`[lib/github][autoPR] Could not comment on issue #${input.issueNumber}`);
      }
    }

    return { prUrl: pr.url, prNumber: pr.number, branch };
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // non-fatal
    }
  }
}
