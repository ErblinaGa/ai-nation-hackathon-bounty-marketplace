/**
 * [cli/bid_status] `lb bid status <bid-id>`
 *
 * Poll bid status. With --watch: keeps polling until terminal state.
 */
import { getApiBase, withAuth } from "../auth.js";

interface BidStatusResponse {
  id: string;
  bounty_id: string;
  bidder_pubkey: string;
  bid_type: string;
  code_hash: string;
  asked_price_sats: number;
  test_status: string;
  test_output: string | null;
  status: string;
  submitted_at: string;
  error?: string;
}

export interface BidStatusOpts {
  watch?: boolean;
  api?: string;
  intervalMs?: number;
}

const TERMINAL_STATUSES = new Set(["PASS", "FAIL", "WON", "LOST", "REFUNDED", "EXPIRED"]);

function statusLine(bid: BidStatusResponse): string {
  const time = new Date(bid.submitted_at).toLocaleTimeString();
  return `  ${bid.id}  status=${bid.status}  test=${bid.test_status}  sats=${bid.asked_price_sats}  at=${time}`;
}

async function fetchBidStatus(apiBase: string, bidId: string): Promise<BidStatusResponse> {
  const res = await fetch(`${apiBase}/bid/${bidId}`, {
    headers: withAuth(),
  });
  const data = (await res.json()) as BidStatusResponse;
  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return data;
}

export async function runBidStatus(bidId: string, opts: BidStatusOpts): Promise<void> {
  if (!bidId?.trim()) {
    console.error("[bid status] bid-id is required");
    process.exit(1);
  }

  const apiBase = opts.api ?? getApiBase();
  const intervalMs = opts.intervalMs ?? 3000;

  // Single poll
  if (!opts.watch) {
    let bid: BidStatusResponse;
    try {
      bid = await fetchBidStatus(apiBase, bidId);
    } catch (err) {
      console.error(
        `[bid status] Failed: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(1);
    }

    console.log(`\n${statusLine(bid)}`);

    if (bid.test_output) {
      console.log(`\n  Test output:`);
      const preview = bid.test_output.slice(0, 2000);
      for (const line of preview.split("\n")) {
        console.log(`    ${line}`);
      }
    }
    console.log(``);
    return;
  }

  // Watch mode
  console.log(`[bid status] Watching ${bidId} (Ctrl+C to stop)...`);

  let lastStatus = "";
  process.on("SIGINT", () => {
    console.log("\n[bid status] Stopped.");
    process.exit(0);
  });

  while (true) {
    try {
      const bid = await fetchBidStatus(apiBase, bidId);
      const current = `${bid.status}:${bid.test_status}`;

      if (current !== lastStatus) {
        lastStatus = current;
        const ts = new Date().toLocaleTimeString();
        console.log(`[${ts}] status=${bid.status}  test=${bid.test_status}`);

        if (bid.status === "WON") {
          console.log(`  WON ${bid.asked_price_sats} sats!`);
        } else if (bid.status === "LOST") {
          console.log(`  Lost. Another bid was selected.`);
        } else if (bid.status === "REFUNDED") {
          console.log(`  Stake refunded.`);
        }

        if (TERMINAL_STATUSES.has(bid.status)) {
          if (bid.test_output) {
            console.log(`\n  Test output (last 1000 chars):`);
            const tail = bid.test_output.slice(-1000);
            for (const line of tail.split("\n")) {
              console.log(`    ${line}`);
            }
          }
          console.log(`\n[bid status] Reached terminal state: ${bid.status}`);
          break;
        }
      }
    } catch (err) {
      console.error(
        `[bid status] Poll error: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }
}
