/**
 * [cli/bids] `lb bids` — list YOUR bid history.
 *
 * Shows bid_id, bounty_id, status, asked_price, submitted_at, payout (if WON).
 * Authenticated via x-api-key or x-pubkey (legacy).
 */
import { getApiBase, withAuth } from "../auth.js";

interface BidHistoryItem {
  bid_id: string;
  bounty_id: string;
  bounty_title: string | null;
  bid_type: string;
  code_hash: string;
  asked_price_sats: number;
  test_status: string;
  status: string;
  submitted_at: string;
  payout_sats: number | null;
}

export interface BidsOpts {
  json?: boolean;
  limit?: string;
  api?: string;
}

export async function runBids(opts: BidsOpts): Promise<void> {
  const apiBase = opts.api ?? getApiBase();
  const limit = opts.limit ? Math.min(parseInt(opts.limit, 10), 200) : 50;

  let bids: BidHistoryItem[];
  try {
    const params = new URLSearchParams({ limit: limit.toString() });
    const res = await fetch(`${apiBase}/bids?${params.toString()}`, {
      headers: withAuth(),
    });
    const data = (await res.json()) as { success: boolean; bids?: BidHistoryItem[]; error?: string };

    if (!res.ok || !data.success) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }

    bids = data.bids ?? [];
  } catch (err) {
    console.error(
      `[bids] Failed to fetch bid history: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }

  if (opts.json) {
    for (const b of bids) {
      process.stdout.write(JSON.stringify(b) + "\n");
    }
    return;
  }

  if (bids.length === 0) {
    console.log("No bids found.");
    return;
  }

  // Human-readable table
  console.log(
    `\n${"BID ID".padEnd(18)}  ${"STATUS".padEnd(12)}  ${"TEST".padEnd(8)}  ${"SATS".padEnd(8)}  ${"SUBMITTED".padEnd(19)}  BOUNTY`
  );
  console.log(
    `${"-".repeat(18)}  ${"-".repeat(12)}  ${"-".repeat(8)}  ${"-".repeat(8)}  ${"-".repeat(19)}  ------`
  );

  for (const b of bids) {
    const bidId = b.bid_id.slice(0, 18).padEnd(18);
    const status = b.status.padEnd(12);
    const test = b.test_status.padEnd(8);
    const sats = (b.payout_sats != null
      ? `+${b.payout_sats}`
      : b.asked_price_sats.toString()
    ).padEnd(8);
    const submitted = new Date(b.submitted_at).toLocaleString().padEnd(19);
    const title = (b.bounty_title ?? b.bounty_id).slice(0, 40);
    console.log(`${bidId}  ${status}  ${test}  ${sats}  ${submitted}  ${title}`);
  }

  console.log(`\n${bids.length} bid(s).`);
}
