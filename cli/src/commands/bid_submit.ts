/**
 * [cli/bid_submit] `lb bid submit <bounty-id> <diff-file>` [--auto-pay-stake]
 *
 * Reads a diff from file and POSTs it to /api/bounty/<id>/bid.
 * The server identifies the bidder via x-api-key.
 * In stub mode (no auth), falls back to demo pubkey.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getApiBase, readConfig, withAuth, DEMO_BIDDER_PUBKEY } from "../auth.js";

interface SubmitBidResponse {
  bid_id: string;
  stake_invoice: string;
  stake_payment_hash: string;
  code_hash: string;
  status: string;
  error?: string;
}

export interface BidSubmitOpts {
  autoPayStake?: boolean;
  api?: string;
}

export async function runBidSubmit(
  bountyId: string,
  diffFile: string,
  opts: BidSubmitOpts
): Promise<void> {
  if (!bountyId?.trim()) {
    console.error("[bid submit] bounty-id is required");
    process.exit(1);
  }
  if (!diffFile?.trim()) {
    console.error("[bid submit] diff-file is required");
    process.exit(1);
  }

  const diffPath = resolve(process.cwd(), diffFile);
  if (!existsSync(diffPath)) {
    console.error(`[bid submit] diff file not found: ${diffPath}`);
    process.exit(1);
  }

  const diff = readFileSync(diffPath, "utf-8");
  if (!diff.trim()) {
    console.error("[bid submit] diff file is empty");
    process.exit(1);
  }

  const apiBase = opts.api ?? getApiBase();
  const config = readConfig();

  // Determine bidder pubkey:
  // - with auth: server resolves from api_key. We still need to pass bidder_pubkey for now (existing route requires it).
  //   Send a sentinel that the server can override.
  // - without auth (stub mode): use demo pubkey
  const bidderPubkey = config?.api_key ? "from_api_key" : DEMO_BIDDER_PUBKEY;

  console.log(`\nlb bid submit`);
  console.log(`  bounty     : ${bountyId}`);
  console.log(`  diff       : ${diffPath}`);
  console.log(`  diff size  : ${diff.length} chars`);
  console.log(`  auto-stake : ${opts.autoPayStake ? "yes" : "no"}`);
  console.log(`  api        : ${apiBase}`);
  console.log(``);

  const headers = withAuth();

  let result: SubmitBidResponse;
  try {
    const res = await fetch(`${apiBase}/bounty/${bountyId}/bid`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        bidder_pubkey: bidderPubkey,
        code: diff,
        bid_type: "diff",
        auto_pay_stake: opts.autoPayStake ?? false,
      }),
    });

    result = (await res.json()) as SubmitBidResponse;

    if (!res.ok) {
      throw new Error(result.error ?? `HTTP ${res.status}`);
    }
  } catch (err) {
    console.error(
      `[bid submit] Failed to submit bid: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }

  console.log(`Bid submitted!`);
  console.log(`  Bid ID     : ${result.bid_id}`);
  console.log(`  Status     : ${result.status}`);
  console.log(`  Code hash  : ${result.code_hash}`);
  console.log(``);

  if (result.status === "AWAITING_STAKE") {
    console.log(`  Stake invoice:`);
    console.log(`  ${result.stake_invoice}`);
    console.log(``);
    console.log(`  Pay the invoice to activate your bid. Track with:`);
    console.log(`    lb bid status ${result.bid_id} --watch`);
  } else {
    console.log(`  Track status: lb bid status ${result.bid_id}`);
  }
  console.log(``);
}
