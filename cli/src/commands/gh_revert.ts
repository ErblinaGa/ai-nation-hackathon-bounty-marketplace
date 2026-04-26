/**
 * [cli/gh_revert] `lb gh-revert <bounty-id>`
 *
 * Opens a revert PR for a SETTLED+MERGED GitHub bounty.
 * Winner keeps the sats — this is purely a GitHub revert.
 *
 * Flow:
 *  1. GET /api/bounty/<id> — validate SETTLED + merged_at set
 *  2. POST /api/bounty/<id>/revert — triggers autoRevert server-side
 *  3. Print revert PR URL
 */
import { requireAuth } from "../github.js";

const DEFAULT_API_BASE = "http://localhost:3000";
const DEMO_POSTER_PUBKEY = "02demo_poster_pubkey";

export interface GhRevertOpts {
  api: string;
}

interface BountyDetail {
  id: string;
  status: string;
  title: string;
  github_repo: string | null;
  github_pr_url: string | null;
  merged_at: string | null;
  reverted_at: string | null;
  revert_pr_url: string | null;
}

interface RevertResponse {
  success: boolean;
  revert_pr_url?: string;
  revert_pr_number?: number;
  reverted_at?: string;
  branch?: string;
  already_reverted?: boolean;
  error?: string;
}

async function fetchBounty(apiBase: string, bountyId: string): Promise<BountyDetail> {
  const res = await fetch(`${apiBase}/api/bounty/${bountyId}`);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({} as { error?: string }))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as BountyDetail;
}

export async function runGhRevert(bountyId: string, opts: GhRevertOpts): Promise<void> {
  await requireAuth();

  const apiBase = opts.api.replace(/\/$/, "");

  console.log(`\nlb gh-revert`);
  console.log(`  bounty_id : ${bountyId}`);
  console.log(`  api       : ${apiBase}`);
  console.log(``);

  // 1. Fetch + validate bounty
  console.log(`[gh-revert] Fetching bounty...`);
  let bounty: BountyDetail;
  try {
    bounty = await fetchBounty(apiBase, bountyId);
  } catch (err) {
    console.error(
      `[gh-revert] Error fetching bounty: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  if (bounty.status !== "SETTLED") {
    console.error(
      `[gh-revert] Bounty is not SETTLED (current status: ${bounty.status}). Cannot revert.`,
    );
    process.exit(1);
  }

  if (!bounty.github_pr_url) {
    console.error(
      `[gh-revert] No github_pr_url on bounty. Run \`lb gh-pr ${bountyId}\` first to open a PR.`,
    );
    process.exit(1);
  }

  if (!bounty.merged_at) {
    console.error(
      `[gh-revert] PR has not been merged yet. Run \`lb gh-merge ${bountyId}\` first.`,
    );
    process.exit(1);
  }

  if (bounty.reverted_at) {
    console.log(`[gh-revert] Already reverted at ${bounty.reverted_at}.`);
    if (bounty.revert_pr_url) {
      console.log(`  Revert PR : ${bounty.revert_pr_url}`);
    }
    process.exit(0);
  }

  console.log(`[gh-revert] Triggering revert via API...`);
  console.log(`[gh-revert] Original PR: ${bounty.github_pr_url}`);
  console.log(`[gh-revert] Note: Winner keeps the sats — only GitHub changes are reverted.`);
  console.log(``);

  // 2. POST to revert endpoint (server handles clone + git revert + push + PR)
  let result: RevertResponse;
  try {
    const res = await fetch(`${apiBase}/api/bounty/${bountyId}/revert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pubkey": DEMO_POSTER_PUBKEY,
      },
      body: JSON.stringify({}),
    });

    result = (await res.json()) as RevertResponse;

    if (!res.ok || !result.success) {
      throw new Error(result.error ?? `HTTP ${res.status}`);
    }
  } catch (err) {
    console.error(
      `[gh-revert] Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  if (result.already_reverted) {
    console.log(`[gh-revert] Already reverted — nothing to do.`);
    if (result.revert_pr_url) {
      console.log(`  Revert PR : ${result.revert_pr_url}`);
    }
    process.exit(0);
  }

  // 3. Print results
  console.log(`Revert complete!`);
  console.log(`  Revert PR  : ${result.revert_pr_url}`);
  console.log(`  PR #       : ${result.revert_pr_number}`);
  console.log(`  Branch     : ${result.branch}`);
  console.log(`  Reverted at: ${result.reverted_at}`);
  console.log(`  Bounty     : ${apiBase}/bounty/${bountyId}`);
  console.log(``);
  console.log(`Note: The winner keeps their sats.`);
}
