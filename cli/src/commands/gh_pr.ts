/**
 * [cli/gh_pr] `lb gh-pr <bounty-id>`
 *
 * Manual trigger for opening a PR from a settled GitHub bounty.
 * Normally Phase 4 auto-PR handles this; this is the fallback.
 *
 * Flow:
 *  1. GET /api/bounty/<id> — validate SETTLED + github_pr_url IS NULL + github_repo set
 *  2. GET /api/bounty/<id>/winning-diff — fetch winner's diff
 *  3. Clone repo to temp dir
 *  4. Apply diff, create branch, push
 *  5. gh pr create
 *  6. PATCH /api/bounty/<id> with github_pr_url
 */
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ghRepoClone, ghPullRequestCreate, requireAuth } from "../github.js";

const DEFAULT_API_BASE = "http://localhost:3000";
const DEMO_POSTER_PUBKEY = "02demo_poster_pubkey";
const BOUNTY_UI_BASE = process.env.BOUNTY_URL ?? "http://localhost:3000";

interface GhPrOpts {
  api: string;
}

interface BountyDetail {
  id: string;
  status: string;
  title: string;
  github_repo: string | null;
  github_issue_number: number | null;
  github_pr_url: string | null;
  winning_bid_id: string | null;
  auditor_result: { notes?: string; winner_bid_id?: string | null } | null;
}

interface WinningDiff {
  diff: string;
  bid_id: string;
  bidder_pubkey: string;
  asked_price_sats: number;
  test_output: string | null;
  auditor_reasoning: string | null;
}

/**
 * [cli/gh_pr][normalizeNewFileDiffs] Rewrites incorrect `--- a/<path>` headers
 * to `--- /dev/null` for hunks that create new files (source line count = 0).
 *
 * Mirror of lib/sandbox.ts normalizeNewFileDiffs — duplicated here because the
 * CLI is a standalone ESM package that cannot import from the Next.js lib tree.
 */
function normalizeNewFileDiffs(diff: string, dir: string): string {
  const lines = diff.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("--- ")) {
      const minusLine = line;
      const plusLine = lines[i + 1] ?? "";

      if (plusLine.startsWith("+++ ")) {
        const minusPath = minusLine.slice(4).trim();

        let relPath: string | null = null;
        if (minusPath.startsWith("a/")) {
          relPath = minusPath.slice(2);
        } else if (minusPath === "/dev/null" || minusPath === "a/dev/null") {
          relPath = null;
        }

        let firstHunkIdx = -1;
        for (let j = i + 2; j < lines.length; j++) {
          if (lines[j].startsWith("@@ ")) {
            firstHunkIdx = j;
            break;
          }
          if (lines[j].startsWith("--- ") && (lines[j + 1] ?? "").startsWith("+++ ")) {
            break;
          }
        }

        const firstHunk = firstHunkIdx >= 0 ? lines[firstHunkIdx] : "";
        const isNewFileHunk = /^@@ -0(,0)? \+/.test(firstHunk);
        const isWrongDevNull = minusPath === "a/dev/null";

        if (isNewFileHunk && relPath !== null && !existsSync(join(dir, relPath))) {
          result.push("--- /dev/null");
        } else if (isWrongDevNull) {
          result.push("--- /dev/null");
        } else {
          result.push(minusLine);
        }

        i++;
        continue;
      }
    }

    result.push(line);
    i++;
  }

  return result.join("\n");
}

/**
 * [cli/gh_pr][applyDiff] Applies a unified diff to a git working tree.
 * Falls back to `patch -p1` if `git apply` fails.
 */
function applyDiff(repoDir: string, diff: string): void {
  const patchFile = join(repoDir, ".lb-patch.diff");
  // Normalize new-file diff headers before applying (LLMs often produce
  // `--- a/<path>` for new files instead of `--- /dev/null`).
  const withFixedHeaders = normalizeNewFileDiffs(diff, repoDir);
  // LLM diffs often miss trailing newline that POSIX patch tools require.
  const normalized = withFixedHeaders.endsWith("\n") ? withFixedHeaders : withFixedHeaders + "\n";
  writeFileSync(patchFile, normalized, "utf-8");

  // Patch CLI first (more lenient with LLM hunk drift), then git apply variants
  const attempts: Array<{ cmd: string; args: string[] }> = [
    { cmd: "patch", args: ["-p1", "-l", "--fuzz=3", "--input", patchFile] },
    { cmd: "patch", args: ["-p1", "-l", "--fuzz=5", "--ignore-whitespace", "--input", patchFile] },
    { cmd: "git", args: ["apply", "--whitespace=fix", "--recount", patchFile] },
    { cmd: "git", args: ["apply", "--whitespace=fix", "--recount", "--ignore-whitespace", "--ignore-space-change", patchFile] },
  ];

  let lastErr: unknown = null;
  for (const { cmd, args } of attempts) {
    try {
      execFileSync(cmd, args, { cwd: repoDir, stdio: "pipe" });
      try { rmSync(patchFile); } catch { /* non-fatal */ }
      return;
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(
    `[gh-pr][applyDiff] Failed to apply diff after ${attempts.length} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

export async function runGhPr(bountyId: string, opts: GhPrOpts): Promise<void> {
  await requireAuth();

  const apiBase = opts.api.replace(/\/$/, "");

  console.log(`\nlb gh-pr`);
  console.log(`  bounty_id : ${bountyId}`);
  console.log(`  api       : ${apiBase}`);
  console.log(``);

  // 1. Fetch bounty detail
  console.log(`[gh-pr] Fetching bounty...`);
  let bounty: BountyDetail;
  try {
    const res = await fetch(`${apiBase}/api/bounty/${bountyId}`);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({} as { error?: string }))) as { error?: string };
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    bounty = (await res.json()) as BountyDetail;
  } catch (err) {
    console.error(
      `[gh-pr] Error fetching bounty: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  // Validations
  if (bounty.status !== "SETTLED") {
    console.error(
      `[gh-pr] Bounty is not SETTLED (current status: ${bounty.status}). Cannot open PR yet.`,
    );
    process.exit(1);
  }
  if (!bounty.github_repo) {
    console.error(`[gh-pr] Bounty is not a GitHub-driven bounty. No github_repo field.`);
    process.exit(1);
  }
  if (bounty.github_pr_url) {
    console.log(`[gh-pr] PR already exists: ${bounty.github_pr_url}`);
    process.exit(0);
  }
  if (!bounty.winning_bid_id) {
    console.error(`[gh-pr] No winning_bid_id on bounty.`);
    process.exit(1);
  }

  const [owner, repo] = bounty.github_repo.split("/");

  // 2. Fetch winning diff
  console.log(`[gh-pr] Fetching winning diff...`);
  let winnerDiff: WinningDiff;
  try {
    const res = await fetch(`${apiBase}/api/bounty/${bountyId}/winning-diff`, {
      headers: { "x-pubkey": DEMO_POSTER_PUBKEY },
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({} as { error?: string }))) as { error?: string };
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    winnerDiff = (await res.json()) as WinningDiff;
  } catch (err) {
    console.error(
      `[gh-pr] Error fetching winning diff: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  if (!winnerDiff.diff?.trim()) {
    console.error(`[gh-pr] Winning diff is empty. Cannot create PR.`);
    process.exit(1);
  }

  // 3. Clone repo + apply diff + push branch
  const tmpDir = mkdtempSync(join(tmpdir(), "lb-gh-pr-"));
  const repoDir = join(tmpDir, "repo");

  try {
    console.log(`[gh-pr] Cloning ${owner}/${repo}...`);
    await ghRepoClone(`${owner}/${repo}`, repoDir);

    const branchName = `lb-bounty/${bountyId.slice(0, 12)}`;
    console.log(`[gh-pr] Creating branch: ${branchName}`);
    execFileSync("git", ["checkout", "-b", branchName], {
      cwd: repoDir,
      stdio: "pipe",
    });

    console.log(`[gh-pr] Applying winning diff...`);
    applyDiff(repoDir, winnerDiff.diff);

    execFileSync("git", ["add", "-A"], { cwd: repoDir, stdio: "pipe" });
    execFileSync(
      "git",
      [
        "commit",
        "--no-gpg-sign",
        "-m",
        `marketplace bounty: ${bounty.title} (#${bounty.github_issue_number ?? "??"})`,
      ],
      { cwd: repoDir, stdio: "pipe" },
    );

    console.log(`[gh-pr] Pushing branch to origin...`);
    execFileSync("git", ["push", "--force", "origin", branchName], {
      cwd: repoDir,
      stdio: "pipe",
    });

    // 4. Build PR body
    const bountyPageUrl = `${BOUNTY_UI_BASE}/bounty/${bountyId}`;
    const prBody = [
      `## Lightning Bounty: ${bounty.title}`,
      ``,
      `Resolved via [Lightning Bounty Marketplace](${bountyPageUrl})`,
      ``,
      `**Winning bid:** \`${winnerDiff.bid_id}\``,
      `**Bidder:** \`${winnerDiff.bidder_pubkey.slice(0, 12)}...\``,
      `**Price:** ${winnerDiff.asked_price_sats} sats`,
      ``,
      bounty.auditor_result?.notes
        ? `**Auditor summary:** ${bounty.auditor_result.notes}`
        : "",
      winnerDiff.auditor_reasoning
        ? `\n**Auditor reasoning:** ${winnerDiff.auditor_reasoning}`
        : "",
      winnerDiff.test_output
        ? `\n<details><summary>Test output</summary>\n\n\`\`\`\n${winnerDiff.test_output.slice(0, 2000)}\n\`\`\`\n</details>`
        : "",
      ``,
      `---`,
      `*Opened automatically by [lb gh-pr](${bountyPageUrl})*`,
    ]
      .filter((l) => l !== undefined)
      .join("\n");

    // 5. Create PR
    console.log(`[gh-pr] Opening PR...`);
    const pr = await ghPullRequestCreate({
      repo: `${owner}/${repo}`,
      head: branchName,
      base: "main",
      title: `marketplace bounty: ${bounty.title}`,
      body: prBody,
    });

    // 6. PATCH bounty with PR URL
    console.log(`[gh-pr] Recording PR URL on bounty...`);
    try {
      await fetch(`${apiBase}/api/bounty/${bountyId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-pubkey": DEMO_POSTER_PUBKEY,
        },
        body: JSON.stringify({ github_pr_url: pr.url }),
      });
    } catch {
      // Non-fatal — PR was created, just couldn't record the URL back
      console.warn(`[gh-pr] Warning: could not PATCH bounty with PR URL (PR was still created)`);
    }

    console.log(`\nPR opened!`);
    console.log(`  PR URL    : ${pr.url}`);
    console.log(`  PR #      : ${pr.number}`);
    console.log(`  Branch    : ${branchName}`);
    console.log(`  Bounty    : ${bountyPageUrl}`);
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // non-fatal
    }
  }
}
