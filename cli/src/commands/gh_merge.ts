/**
 * [cli/gh_merge] `lb gh-merge <bounty-id>`
 *
 * Wrap `gh pr merge` so the merge is also tracked in the DB and surfaced in UI.
 *
 * Flow:
 *  1. GET /api/bounty/<id> — validate status='SETTLED' AND github_pr_url set
 *  2. Run `gh pr merge <pr_url> --<strategy> --delete-branch`
 *  3. PATCH /api/bounty/<id> with merged_at timestamp
 *  4. Optional: post a comment on the original GitHub issue
 */
import { execFileSync } from "node:child_process";
import { requireAuth } from "../github.js";

const DEFAULT_API_BASE = "http://localhost:3000";
const DEMO_POSTER_PUBKEY = "02demo_poster_pubkey";

export type MergeStrategy = "squash" | "merge" | "rebase";

export interface GhMergeOpts {
  api: string;
  strategy: MergeStrategy;
}

interface BountyDetail {
  id: string;
  status: string;
  title: string;
  github_repo: string | null;
  github_issue_number: number | null;
  github_pr_url: string | null;
  merged_at: string | null;
}

/**
 * [gh_merge][fetchBounty] GET bounty detail from API.
 */
async function fetchBounty(apiBase: string, bountyId: string): Promise<BountyDetail> {
  const res = await fetch(`${apiBase}/api/bounty/${bountyId}`);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({} as { error?: string }))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as BountyDetail;
}

/**
 * [gh_merge][patchBounty] PATCH merged_at back to the API.
 */
async function patchMergedAt(
  apiBase: string,
  bountyId: string,
  mergedAt: string,
): Promise<void> {
  const res = await fetch(`${apiBase}/api/bounty/${bountyId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-pubkey": DEMO_POSTER_PUBKEY,
    },
    body: JSON.stringify({ merged_at: mergedAt }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({} as { error?: string }))) as { error?: string };
    // Non-fatal — the merge succeeded; just warn
    console.warn(
      `[gh-merge] Warning: could not record merged_at on bounty: ${err.error ?? `HTTP ${res.status}`}`,
    );
  }
}

/**
 * [gh_merge][postIssueComment] Post a closing comment on the GitHub issue.
 * Non-fatal on failure.
 */
function postIssueComment(
  ownerRepo: string,
  issueNumber: number,
  prUrl: string,
  bountyId: string,
): void {
  try {
    const body = `Merged via [Lightning Bounty Marketplace](${DEFAULT_API_BASE}/bounty/${bountyId}).\n\nPR: ${prUrl}`;
    execFileSync(
      "gh",
      ["issue", "comment", String(issueNumber), "--repo", ownerRepo, "--body", body],
      { stdio: "pipe" },
    );
    console.log(`[gh-merge] Posted comment on issue #${issueNumber}`);
  } catch (err) {
    console.warn(
      `[gh-merge] Warning: could not post issue comment: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function runGhMerge(bountyId: string, opts: GhMergeOpts): Promise<void> {
  await requireAuth();

  const apiBase = opts.api.replace(/\/$/, "");
  const strategy = opts.strategy ?? "squash";

  console.log(`\nlb gh-merge`);
  console.log(`  bounty_id : ${bountyId}`);
  console.log(`  strategy  : ${strategy}`);
  console.log(`  api       : ${apiBase}`);
  console.log(``);

  // 1. Fetch + validate bounty
  console.log(`[gh-merge] Fetching bounty...`);
  let bounty: BountyDetail;
  try {
    bounty = await fetchBounty(apiBase, bountyId);
  } catch (err) {
    console.error(
      `[gh-merge] Error fetching bounty: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  if (bounty.status !== "SETTLED") {
    console.error(
      `[gh-merge] Bounty is not SETTLED (current status: ${bounty.status}). Cannot merge yet.`,
    );
    process.exit(1);
  }

  if (!bounty.github_pr_url) {
    console.error(
      `[gh-merge] No github_pr_url on bounty. Run \`lb gh-pr ${bountyId}\` first to open a PR.`,
    );
    process.exit(1);
  }

  if (bounty.merged_at) {
    console.log(`[gh-merge] PR already merged at ${bounty.merged_at}. Nothing to do.`);
    process.exit(0);
  }

  const prUrl = bounty.github_pr_url;

  // 2. Run gh pr merge
  console.log(`[gh-merge] Merging PR: ${prUrl}`);
  console.log(`[gh-merge] Strategy: --${strategy} --delete-branch`);

  try {
    execFileSync(
      "gh",
      ["pr", "merge", prUrl, `--${strategy}`, "--delete-branch"],
      { stdio: "inherit" },
    );
  } catch (err) {
    console.error(
      `[gh-merge] Error merging PR: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  // 3. PATCH bounty with merged_at
  const mergedAt = new Date().toISOString();
  console.log(`[gh-merge] Recording merged_at=${mergedAt} on bounty...`);
  await patchMergedAt(apiBase, bountyId, mergedAt);

  // 4. Optional: comment on the GitHub issue
  if (bounty.github_repo && bounty.github_issue_number) {
    postIssueComment(bounty.github_repo, bounty.github_issue_number, prUrl, bountyId);
  }

  console.log(`\nMerge complete!`);
  console.log(`  PR URL    : ${prUrl}`);
  console.log(`  Strategy  : ${strategy}`);
  console.log(`  Merged at : ${mergedAt}`);
  console.log(`  Bounty    : ${apiBase}/bounty/${bountyId}`);
}
