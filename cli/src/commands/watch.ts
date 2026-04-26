/**
 * [cli/watch] `lb watch` — long-poll for new bounties, print as they appear.
 *
 * This is the agent daemon entry point.
 * Output: NDJSON by default when --json, human-readable otherwise.
 *
 * Agent usage:
 *   lb watch --json | your-agent-script
 *
 * Flags:
 *   --json              NDJSON output (no banner, just lines)
 *   --filter-language <lang>   only show ts|python bounties
 *   --filter-min-sats <n>      only show bounties >= N sats
 *   --interval <ms>     poll interval in milliseconds (default: 4000)
 *   --api               API base URL
 */
import { getApiBase, withAuth } from "../auth.js";

interface BountyListItem {
  id: string;
  title: string;
  description: string;
  language: string;
  task_type: string;
  max_bounty_sats: number;
  deadline_at: string;
  status: string;
  bid_count: number;
  passing_bid_count: number;
  created_at: string;
}

export interface WatchOpts {
  json?: boolean;
  filterLanguage?: string;
  filterMinSats?: string;
  interval?: string;
  api?: string;
}

async function fetchNewBounties(
  apiBase: string,
  since: string,
  language?: string,
  minSats?: number
): Promise<BountyListItem[]> {
  const params = new URLSearchParams({ status: "OPEN", since });
  if (language) params.set("language", language);
  if (minSats != null) params.set("min_bounty", minSats.toString());

  const res = await fetch(`${apiBase}/bounties?${params.toString()}`, {
    headers: withAuth(),
  });

  if (!res.ok) {
    throw new Error(`API returned ${res.status}`);
  }

  const data = (await res.json()) as { bounties?: BountyListItem[] };
  return data.bounties ?? [];
}

export async function runWatch(opts: WatchOpts): Promise<void> {
  const apiBase = opts.api ?? getApiBase();
  const isJson = opts.json ?? false;
  const intervalMs = Math.max(1000, parseInt(opts.interval ?? "4000", 10));
  const minSats = opts.filterMinSats ? parseInt(opts.filterMinSats, 10) : undefined;

  const langNorm: Record<string, string> = {
    ts: "typescript",
    typescript: "typescript",
    py: "python",
    python: "python",
  };
  const language = opts.filterLanguage ? (langNorm[opts.filterLanguage] ?? opts.filterLanguage) : undefined;

  if (!isJson) {
    console.log(`[watch] Watching for new bounties... (Ctrl+C to stop)`);
    if (language) console.log(`[watch] Filter: language=${language}`);
    if (minSats != null) console.log(`[watch] Filter: min_sats=${minSats}`);
    console.log(`[watch] Poll interval: ${intervalMs}ms`);
    console.log(``);
  }

  // Start from now; only surface bounties created AFTER this moment
  let since = new Date().toISOString();

  // Graceful shutdown
  process.on("SIGINT", () => {
    if (!isJson) console.log("\n[watch] Stopped.");
    process.exit(0);
  });
  process.on("SIGTERM", () => process.exit(0));

  while (true) {
    try {
      const bounties = await fetchNewBounties(apiBase, since, language, minSats);

      if (bounties.length > 0) {
        // Advance since to the latest created_at seen
        const latestCreatedAt = bounties.reduce((max, b) => {
          return b.created_at > max ? b.created_at : max;
        }, since);
        since = latestCreatedAt;

        for (const b of bounties) {
          if (isJson) {
            process.stdout.write(JSON.stringify(b) + "\n");
          } else {
            const deadline = new Date(b.deadline_at).toLocaleTimeString();
            console.log(
              `[+] ${b.id.slice(0, 14)}  ${b.task_type.padEnd(9)}  ${b.max_bounty_sats.toString().padStart(7)} sats  exp:${deadline}  ${b.title}`
            );
          }
        }
      }
    } catch (err) {
      if (!isJson) {
        console.error(
          `[watch] Poll error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }
}
