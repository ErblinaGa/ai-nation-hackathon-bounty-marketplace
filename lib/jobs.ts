// Background polling job for the Lightning Bounty Marketplace.
// Runs every 1000ms in a single-process setInterval (no workers needed for demo).
// Uses globalThis.__jobs_started so Next.js HMR doesn't create duplicate intervals.
import { getDb } from "./db";
import { getLightningClient } from "./lightning";
import { getSandboxClient } from "./sandbox";
import { runAuditor } from "./auditor";
import { autoPR } from "./github";

declare global {
  // eslint-disable-next-line no-var
  var __jobs_started: boolean | undefined;
}

export function ensureJobsRunning(): void {
  if (globalThis.__jobs_started) return;
  globalThis.__jobs_started = true;
  setInterval(tick, 1000);
  console.log("[jobs] background polling started");
}

async function tick(): Promise<void> {
  try {
    await checkPendingBountyStakes();
    await checkPendingBidStakes();
    await checkExpiredBounties();
    await checkAuditableGithubBounties();
  } catch (err) {
    console.error("[jobs][tick] unhandled error:", err);
  }
}

// (a) For each bounty in AWAITING_STAKE_PAYMENT: check if hold-invoice is ACCEPTED → set OPEN.
async function checkPendingBountyStakes(): Promise<void> {
  const db = getDb();
  const lightning = getLightningClient();

  const pendingBounties = db
    .prepare(
      "SELECT id, poster_stake_payment_hash FROM bounties WHERE status = 'AWAITING_STAKE_PAYMENT'"
    )
    .all() as Array<{ id: string; poster_stake_payment_hash: string }>;

  for (const bounty of pendingBounties) {
    try {
      const invoice = await lightning.getInvoice(
        bounty.poster_stake_payment_hash
      );
      if (invoice?.status === "ACCEPTED") {
        db.prepare("UPDATE bounties SET status = 'OPEN' WHERE id = ?").run(
          bounty.id
        );
        console.log(`[jobs] bounty ${bounty.id} → OPEN`);
      }
    } catch (err) {
      console.error(
        `[jobs][stake-check] error for bounty ${bounty.id}:`,
        err
      );
    }
  }
}

// (b) For each bid in AWAITING_STAKE: check if stake is ACCEPTED → run tests.
async function checkPendingBidStakes(): Promise<void> {
  const db = getDb();
  const lightning = getLightningClient();
  const sandbox = getSandboxClient();

  const pendingBids = db
    .prepare(
      `SELECT b.id, b.bounty_id, b.stake_payment_hash, b.code, b.asked_price_sats,
              bn.language, bn.test_suite, bn.task_type, bn.task_payload
       FROM bids b
       JOIN bounties bn ON bn.id = b.bounty_id
       WHERE b.status = 'AWAITING_STAKE'`
    )
    .all() as Array<{
    id: string;
    bounty_id: string;
    stake_payment_hash: string;
    code: string;
    asked_price_sats: number;
    language: string;
    test_suite: string;
    task_type: string;
    task_payload: string | null;
  }>;

  for (const bid of pendingBids) {
    try {
      const invoice = await lightning.getInvoice(bid.stake_payment_hash);
      if (invoice?.status !== "ACCEPTED") continue;

      // Mark as PENDING (running tests) immediately to avoid double-processing
      db.prepare("UPDATE bids SET status = 'PENDING', test_status = 'PENDING' WHERE id = ?").run(
        bid.id
      );

      // Run tests asynchronously — don't await inline to avoid blocking the tick loop
      runTestsForBid(bid).catch((err) => {
        console.error(`[jobs][test-run] unhandled error for bid ${bid.id}:`, err);
      });
    } catch (err) {
      console.error(`[jobs][bid-stake-check] error for bid ${bid.id}:`, err);
    }
  }
}

async function runTestsForBid(bid: {
  id: string;
  bounty_id: string;
  stake_payment_hash: string;
  code: string;
  language: string;
  test_suite: string;
  task_type: string;
  task_payload: string | null;
}): Promise<void> {
  const db = getDb();
  const lightning = getLightningClient();
  const sandbox = getSandboxClient();

  try {
    console.log(`[jobs] running tests for bid ${bid.id} (task_type=${bid.task_type})`);

    const language = bid.language as "typescript" | "python";
    let result;

    if (bid.task_type === "codebase") {
      // Parse payload; fall back to FAIL if malformed
      let payload;
      try {
        payload = JSON.parse(bid.task_payload ?? "null");
      } catch {
        payload = null;
      }
      if (!payload) {
        result = {
          status: "FAIL" as const,
          output: "[jobs] codebase task_payload missing or invalid JSON",
          metrics: { runtime_ms: 0, mem_mb: null },
        };
      } else {
        result = await sandbox.run({
          kind: "codebase",
          language,
          diff: bid.code ?? "",
          payload,
        });
      }
    } else if (bid.task_type === "bug_bounty") {
      let payload;
      try {
        payload = JSON.parse(bid.task_payload ?? "null");
      } catch {
        payload = null;
      }
      if (!payload) {
        result = {
          status: "FAIL" as const,
          output: "[jobs] bug_bounty task_payload missing or invalid JSON",
          metrics: { runtime_ms: 0, mem_mb: null },
        };
      } else {
        result = await sandbox.run({
          kind: "bug_bounty",
          language,
          diff: bid.code ?? "",
          payload,
        });
      }
    } else {
      // Default: snippet (legacy path)
      result = await sandbox.runTests(language, bid.code ?? "", bid.test_suite);
    }

    const testStatus = result.status; // "PASS" | "FAIL"
    const bidStatus = testStatus === "PASS" ? "PASS" : "FAIL";

    db.prepare(
      "UPDATE bids SET test_status = ?, test_output = ?, status = ? WHERE id = ?"
    ).run(testStatus, result.output.slice(0, 4000), bidStatus, bid.id);

    console.log(`[jobs] bid ${bid.id} test result: ${testStatus}`);

    if (testStatus === "FAIL") {
      // Burn bidder stake to platform — they submitted failing code
      try {
        await lightning.settleHoldInvoice(bid.stake_payment_hash, "02platform_pubkey");
      } catch (err) {
        console.error(
          `[jobs] failed to settle stake for failing bid ${bid.id}:`,
          err
        );
      }
    }
    // PASS: stake stays locked until accept/refund
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    db.prepare(
      "UPDATE bids SET test_status = 'FAIL', test_output = ?, status = 'FAIL' WHERE id = ?"
    ).run(`[sandbox error] ${errorMsg}`, bid.id);

    try {
      await lightning.settleHoldInvoice(bid.stake_payment_hash, "02platform_pubkey");
    } catch {
      // Best-effort
    }
  }
}

// (c) Auto-expire free-form bounties (non-GitHub) past deadline.
// GitHub-driven bounties are handled by checkAuditableGithubBounties instead.
async function checkExpiredBounties(): Promise<void> {
  const db = getDb();
  const lightning = getLightningClient();

  const expiredBounties = db
    .prepare(
      `SELECT id, poster_stake_payment_hash, max_bounty_sats
       FROM bounties
       WHERE status = 'OPEN'
         AND github_repo IS NULL
         AND datetime(deadline_at) <= datetime('now')`
    )
    .all() as Array<{
    id: string;
    poster_stake_payment_hash: string;
    max_bounty_sats: number;
  }>;

  for (const bounty of expiredBounties) {
    try {
      await expireBounty(bounty.id);
    } catch (err) {
      console.error(
        `[jobs][expire] error for bounty ${bounty.id}:`,
        err
      );
    }
  }
}

// (d) For GitHub-driven bounties past deadline with no audit yet: run auditor, persist result, act.
// Idempotent: bounties where auditor_result IS NOT NULL are skipped.
async function checkAuditableGithubBounties(): Promise<void> {
  const db = getDb();

  const auditableBounties = db
    .prepare(
      `SELECT id, auditor_config, extension_count, created_at, deadline_at
       FROM bounties
       WHERE status = 'OPEN'
         AND github_repo IS NOT NULL
         AND auditor_result IS NULL
         AND datetime(deadline_at) <= datetime('now')`
    )
    .all() as Array<{
    id: string;
    auditor_config: string | null;
    extension_count: number;
    created_at: string;
    deadline_at: string;
  }>;

  for (const bounty of auditableBounties) {
    // Atomic claim: set a sentinel auditor_result so subsequent ticks skip this bounty.
    // The runAuditForBounty function will overwrite with the real result.
    const claim = db
      .prepare(
        "UPDATE bounties SET auditor_result = '{\"_claimed\":true}' WHERE id = ? AND auditor_result IS NULL"
      )
      .run(bounty.id);
    if (claim.changes === 0) continue; // Another tick already claimed it

    // Fire-and-forget per bounty so one slow audit doesn't block others.
    runAuditForBounty(bounty).catch((err) => {
      console.error(`[jobs][audit] unhandled error for bounty ${bounty.id}:`, err);
    });
  }
}

async function runAuditForBounty(bounty: {
  id: string;
  auditor_config: string | null;
  extension_count: number;
  created_at: string;
  deadline_at: string;
}): Promise<void> {
  const db = getDb();

  // Outer caller (checkAuditableGithubBounties) has already atomic-claimed this bounty
  // by setting auditor_result to a sentinel placeholder. We just need to verify the
  // bounty is still OPEN (not concurrently expired/canceled).
  const check = db
    .prepare("SELECT id FROM bounties WHERE id = ? AND status = 'OPEN'")
    .get(bounty.id);

  if (!check) {
    return; // Bounty no longer OPEN — undo the claim so we don't leave a stale placeholder
  }

  console.log(`[jobs][audit] running auditor for bounty ${bounty.id}`);

  let result;
  try {
    result = await runAuditor(bounty.id);
  } catch (err) {
    console.error(`[jobs][audit] runAuditor failed for ${bounty.id}:`, err);
    return;
  }

  // Persist result — use a sentinel if null to avoid re-triggering
  try {
    db.prepare("UPDATE bounties SET auditor_result = ? WHERE id = ?").run(
      JSON.stringify(result),
      bounty.id
    );
    console.log(`[jobs][audit] result persisted for ${bounty.id}, decision=${result.decision}`);
  } catch (err) {
    console.error(`[jobs][audit] failed to persist result for ${bounty.id}:`, err);
    return;
  }

  // Act on the decision
  if (result.decision === "PICK_WINNER" || result.decision === "FALLBACK_PICK") {
    if (!result.winner_bid_id) {
      console.warn(`[jobs][audit] ${result.decision} but no winner_bid_id for ${bounty.id}`);
      return;
    }
    try {
      await acceptBid(bounty.id, result.winner_bid_id);
      console.log(
        `[jobs][audit] bounty ${bounty.id} settled → bid ${result.winner_bid_id} (${result.decision})`
      );
    } catch (err) {
      console.error(`[jobs][audit] acceptBid failed for ${bounty.id}:`, err);
      return;
    }

    // V2: For GitHub-driven bounties, auto-open PR with the winning diff
    try {
      await triggerAutoPR(bounty.id, result.winner_bid_id);
    } catch (err) {
      console.error(`[jobs][autoPR] failed for ${bounty.id}:`, err);
      // Non-fatal — bounty is settled, PR can be triggered manually via lb gh-pr
    }
  } else if (result.decision === "REOPEN_BIDDING") {
    // Extend deadline by the original duration (deadline_at - created_at)
    const createdMs = new Date(bounty.created_at).getTime();
    const deadlineMs = new Date(bounty.deadline_at).getTime();
    const originalMinutes = Math.max(1, Math.round((deadlineMs - createdMs) / 60000));
    const newDeadline = new Date(deadlineMs + originalMinutes * 60 * 1000).toISOString();

    try {
      db.prepare(
        `UPDATE bounties
         SET deadline_at = ?, extension_count = extension_count + 1, auditor_result = NULL
         WHERE id = ?`
      ).run(newDeadline, bounty.id);
      console.log(
        `[jobs][audit] bounty ${bounty.id} reopened: new deadline=${newDeadline} extension_count=${bounty.extension_count + 1}`
      );
    } catch (err) {
      console.error(`[jobs][audit] REOPEN_BIDDING DB update failed for ${bounty.id}:`, err);
    }
  }
}

// Shared expire logic used by both the bg job and the manual POST /expire endpoint.
export async function expireBounty(bountyId: string): Promise<void> {
  const db = getDb();
  const lightning = getLightningClient();

  const bounty = db
    .prepare(
      "SELECT id, poster_stake_payment_hash, max_bounty_sats FROM bounties WHERE id = ? AND status = 'OPEN'"
    )
    .get(bountyId) as
    | { id: string; poster_stake_payment_hash: string; max_bounty_sats: number }
    | undefined;

  if (!bounty) return; // Already processed

  // V3 winner-takes-all: all bids commit to the full bounty, so pick by earliest submitted_at.
  const earliestPass = db
    .prepare(
      `SELECT id, asked_price_sats, stake_payment_hash, bidder_pubkey, code
       FROM bids
       WHERE bounty_id = ? AND test_status = 'PASS' AND status = 'PASS'
       ORDER BY submitted_at ASC
       LIMIT 1`
    )
    .get(bountyId) as
    | {
        id: string;
        asked_price_sats: number;
        stake_payment_hash: string;
        bidder_pubkey: string;
        code: string;
      }
    | undefined;

  if (earliestPass) {
    // Auto-select earliest PASS bid — winner-takes-all, quality tiebreaker is submission time
    console.log(
      `[jobs][expire] bounty ${bountyId} — auto-selecting earliest PASS bid ${earliestPass.id}`
    );
    await acceptBid(bountyId, earliestPass.id);
  } else {
    // No PASS bids — cancel poster stake (refund), mark EXPIRED
    console.log(
      `[jobs][expire] bounty ${bountyId} — no PASS bids, canceling poster stake`
    );

    db.transaction(() => {
      db.prepare("UPDATE bounties SET status = 'EXPIRED' WHERE id = ?").run(bountyId);
      // Cancel all AWAITING_STAKE or PENDING bids (shouldn't be any but guard anyway)
      db.prepare(
        "UPDATE bids SET status = 'LOST' WHERE bounty_id = ? AND status IN ('AWAITING_STAKE', 'PENDING', 'PASS')"
      ).run(bountyId);
    })();

    try {
      await lightning.cancelHoldInvoice(bounty.poster_stake_payment_hash);
    } catch (err) {
      console.error(
        `[jobs][expire] failed to cancel poster stake for ${bountyId}:`,
        err
      );
    }
  }
}

// Core accept logic — also called by POST /accept route.
// Exported so the route can call it without duplicating logic.
export async function acceptBid(
  bountyId: string,
  bidId: string
): Promise<{
  code: string;
  payment_hash: string;
  settled_amount_sats: number;
  refunded_to_poster_sats: number;
}> {
  const db = getDb();
  const lightning = getLightningClient();

  const bounty = db
    .prepare(
      "SELECT id, poster_stake_payment_hash, max_bounty_sats, status FROM bounties WHERE id = ?"
    )
    .get(bountyId) as
    | {
        id: string;
        poster_stake_payment_hash: string;
        max_bounty_sats: number;
        status: string;
      }
    | undefined;

  if (!bounty) throw new Error(`[acceptBid] bounty not found: ${bountyId}`);
  if (bounty.status !== "OPEN")
    throw new Error(`[acceptBid] bounty is not OPEN: ${bounty.status}`);

  const winningBid = db
    .prepare(
      "SELECT id, stake_payment_hash, asked_price_sats, code, bidder_pubkey FROM bids WHERE id = ? AND bounty_id = ?"
    )
    .get(bidId, bountyId) as
    | {
        id: string;
        stake_payment_hash: string;
        asked_price_sats: number;
        code: string;
        bidder_pubkey: string;
      }
    | undefined;

  if (!winningBid)
    throw new Error(`[acceptBid] bid not found: ${bidId}`);
  if (!["PASS"].includes(
    (
      db.prepare("SELECT test_status FROM bids WHERE id = ?").get(bidId) as {
        test_status: string;
      }
    )?.test_status
  ))
    throw new Error(`[acceptBid] bid has not PASS test status`);

  const settledAmount = winningBid.asked_price_sats;
  const refundedToPoster = bounty.max_bounty_sats - settledAmount;

  // Atomic DB update first, then Lightning (best-effort for demo)
  db.transaction(() => {
    db.prepare(
      "UPDATE bounties SET status = 'SETTLED', winning_bid_id = ? WHERE id = ?"
    ).run(bidId, bountyId);

    db.prepare(
      "UPDATE bids SET status = 'WON', payment_hash = ? WHERE id = ?"
    ).run(bounty.poster_stake_payment_hash, bidId);

    // Refund all other PASS bids
    db.prepare(
      `UPDATE bids SET status = 'REFUNDED' WHERE bounty_id = ? AND id != ? AND test_status = 'PASS' AND status = 'PASS'`
    ).run(bountyId, bidId);

    // Mark all remaining FAIL bids as LOST (stakes already settled during test run)
    db.prepare(
      `UPDATE bids SET status = 'LOST' WHERE bounty_id = ? AND status = 'FAIL'`
    ).run(bountyId);
  })();

  // Lightning ops — best-effort for demo
  try {
    // Settle poster stake: winner gets asked_price_sats, remainder auto-refunds to poster.
    // settleHoldInvoice handles the partial settle + refund in one transaction.
    await lightning.settleHoldInvoice(
      bounty.poster_stake_payment_hash,
      winningBid.bidder_pubkey,
      settledAmount
    );
  } catch (err) {
    console.error("[acceptBid] failed to settle poster stake:", err);
  }

  try {
    // Cancel winning bidder stake (refund — they won)
    await lightning.cancelHoldInvoice(winningBid.stake_payment_hash);
  } catch (err) {
    console.error("[acceptBid] failed to cancel winner stake:", err);
  }

  // Cancel stakes for all other PASS bidders (refund)
  const otherPassBids = db
    .prepare(
      `SELECT stake_payment_hash FROM bids WHERE bounty_id = ? AND id != ? AND status = 'REFUNDED'`
    )
    .all(bountyId, bidId) as Array<{ stake_payment_hash: string }>;

  for (const bid of otherPassBids) {
    try {
      await lightning.cancelHoldInvoice(bid.stake_payment_hash);
    } catch (err) {
      console.error("[acceptBid] failed to cancel refunded bid stake:", err);
    }
  }

  return {
    code: winningBid.code,
    payment_hash: bounty.poster_stake_payment_hash,
    settled_amount_sats: settledAmount,
    refunded_to_poster_sats: refundedToPoster,
  };
}

// V2: After auditor settles a GitHub-driven bounty, auto-clone repo, apply diff, push branch, open PR.
// Idempotent: skips if github_pr_url already populated.
async function triggerAutoPR(bountyId: string, winningBidId: string): Promise<void> {
  const db = getDb();

  const bounty = db
    .prepare(
      `SELECT id, title, github_repo, github_issue_number, github_commit_sha, github_pr_url, auditor_result
       FROM bounties WHERE id = ?`
    )
    .get(bountyId) as
    | {
        id: string;
        title: string;
        github_repo: string | null;
        github_issue_number: number | null;
        github_commit_sha: string | null;
        github_pr_url: string | null;
        auditor_result: string | null;
      }
    | undefined;

  if (!bounty || !bounty.github_repo || !bounty.github_commit_sha) {
    return; // not a GitHub-driven bounty
  }
  if (bounty.github_pr_url) {
    return; // already PR'd
  }

  const winningBid = db
    .prepare(
      "SELECT id, code, bidder_pubkey, asked_price_sats, test_output FROM bids WHERE id = ?"
    )
    .get(winningBidId) as
    | { id: string; code: string | null; bidder_pubkey: string; asked_price_sats: number; test_output: string | null }
    | undefined;

  if (!winningBid?.code) {
    console.warn(`[jobs][autoPR] no code for winning bid ${winningBidId}`);
    return;
  }

  const auditorResult = (() => {
    try { return JSON.parse(bounty.auditor_result ?? ""); } catch { return null; }
  })();
  const winnerScore = auditorResult?.ranked?.find((r: { bid_id: string }) => r.bid_id === winningBidId);

  const bountyUrl = `${process.env.BOUNTY_URL ?? "http://localhost:3000"}/bounty/${bounty.id}`;

  console.log(`[jobs][autoPR] opening PR on ${bounty.github_repo} for bounty ${bounty.id}`);
  const pr = await autoPR({
    repo: bounty.github_repo,
    sha: bounty.github_commit_sha,
    bountyId: bounty.id,
    issueNumber: bounty.github_issue_number,
    issueTitle: bounty.title,
    diff: winningBid.code,
    bidId: winningBid.id,
    bidderPubkey: winningBid.bidder_pubkey,
    askedPriceSats: winningBid.asked_price_sats,
    auditorNotes: auditorResult?.notes ?? "(no auditor notes)",
    auditorReasoning: winnerScore?.reasoning ?? "(no per-bid reasoning)",
    testOutput: winningBid.test_output,
    bountyUrl,
  });

  db.prepare("UPDATE bounties SET github_pr_url = ? WHERE id = ?").run(pr.prUrl, bounty.id);
  console.log(`[jobs][autoPR] PR opened: ${pr.prUrl}`);
}
