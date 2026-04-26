/**
 * [cli/bounties] `lb bounties` — list open bounties
 *
 * Flags:
 *   --task-type snippet|codebase|bug_bounty|free_form
 *   --language ts|python
 *   --json   output NDJSON (one bounty per line)
 *   --api    API base URL
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
  github_repo: string | null;
}

export interface BountiesOpts {
  taskType?: string;
  language?: string;
  json?: boolean;
  api?: string;
}

function deadlineIn(deadlineAt: string): string {
  const ms = new Date(deadlineAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

function taskTypeShort(t: string): string {
  const map: Record<string, string> = {
    snippet: "snippet",
    codebase: "codebase",
    bug_bounty: "bug",
    free_form: "free",
  };
  return map[t] ?? t;
}

export async function runBounties(opts: BountiesOpts): Promise<void> {
  const apiBase = opts.api ?? getApiBase();
  const params = new URLSearchParams({ status: "OPEN" });

  if (opts.taskType) {
    // normalize: --task-type ts → typescript, etc.
    const normalizeType: Record<string, string> = {
      snippet: "snippet",
      codebase: "codebase",
      bug_bounty: "bug_bounty",
      bug: "bug_bounty",
      free_form: "free_form",
      free: "free_form",
    };
    const normalized = normalizeType[opts.taskType] ?? opts.taskType;
    params.set("task_type", normalized);
  }

  if (opts.language) {
    const normalizeLang: Record<string, string> = {
      ts: "typescript",
      typescript: "typescript",
      py: "python",
      python: "python",
    };
    params.set("language", normalizeLang[opts.language] ?? opts.language);
  }

  let bounties: BountyListItem[];
  try {
    const res = await fetch(`${apiBase}/bounties?${params.toString()}`, {
      headers: withAuth(),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as { error?: string };
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    const data = (await res.json()) as { bounties?: BountyListItem[] };
    bounties = data.bounties ?? [];
  } catch (err) {
    console.error(
      `[bounties] Failed to fetch bounties: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }

  if (bounties.length === 0) {
    if (!opts.json) {
      console.log("No open bounties found.");
    }
    return;
  }

  if (opts.json) {
    // NDJSON — one bounty per line, machine-friendly
    for (const b of bounties) {
      process.stdout.write(JSON.stringify(b) + "\n");
    }
    return;
  }

  // Human-readable table
  const COL_ID = 16;
  const COL_TYPE = 8;
  const COL_SATS = 9;
  const COL_DEADLINE = 10;
  const COL_BIDS = 5;

  // Header
  console.log(
    `${"ID".padEnd(COL_ID)}  ${"TYPE".padEnd(COL_TYPE)}  ${"SATS".padEnd(COL_SATS)}  ${"DEADLINE".padEnd(COL_DEADLINE)}  ${"BIDS".padEnd(COL_BIDS)}  TITLE`
  );
  console.log(
    `${"-".repeat(COL_ID)}  ${"-".repeat(COL_TYPE)}  ${"-".repeat(COL_SATS)}  ${"-".repeat(COL_DEADLINE)}  ${"-".repeat(COL_BIDS)}  -----`
  );

  for (const b of bounties) {
    const id = b.id.slice(0, COL_ID).padEnd(COL_ID);
    const type = taskTypeShort(b.task_type).padEnd(COL_TYPE);
    const sats = b.max_bounty_sats.toString().padEnd(COL_SATS);
    const deadline = deadlineIn(b.deadline_at).padEnd(COL_DEADLINE);
    const bids = b.bid_count.toString().padEnd(COL_BIDS);
    const title = b.title.length > 50 ? b.title.slice(0, 47) + "..." : b.title;
    console.log(`${id}  ${type}  ${sats}  ${deadline}  ${bids}  ${title}`);
  }

  console.log(`\n${bounties.length} open bounty/bounties.`);
}
