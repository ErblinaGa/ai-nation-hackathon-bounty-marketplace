/**
 * [cli/bid_show] `lb bid show <bounty-id>`
 *
 * Fetch full bounty details including context_files.
 * With --download <dir>: write context_files to disk for local work.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { getApiBase, withAuth } from "../auth.js";

interface ContextFile {
  path: string;
  content: string;
}

interface CodebasePayload {
  codebase_id: string;
  context_files: ContextFile[];
  test_command: string;
  task_description: string;
}

interface BugBountyPayload {
  target_code: string;
  language: string;
  symptom: string;
  failing_input_example?: string;
  hidden_test_suite: string;
}

interface BountyDetail {
  id: string;
  title: string;
  description: string;
  language: string;
  task_type: string;
  task_payload: string | null;
  max_bounty_sats: number;
  bid_stake_sats: number;
  deadline_at: string;
  status: string;
  bid_count: number;
  passing_bid_count: number;
  created_at: string;
  poster_pubkey: string;
  starter_code: string | null;
  test_suite: string | null;
}

export interface BidShowOpts {
  download?: string;
  api?: string;
}

function countLines(content: string): number {
  return content.split("\n").length;
}

function deadlineIn(deadlineAt: string): string {
  const ms = new Date(deadlineAt).getTime() - Date.now();
  if (ms <= 0) return "EXPIRED";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} minutes`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export async function runBidShow(bountyId: string, opts: BidShowOpts): Promise<void> {
  if (!bountyId?.trim()) {
    console.error("[bid show] bounty-id is required");
    process.exit(1);
  }

  const apiBase = opts.api ?? getApiBase();

  let bounty: BountyDetail;
  try {
    const res = await fetch(`${apiBase}/bounty/${bountyId}`, {
      headers: withAuth(),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as { error?: string };
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    bounty = (await res.json()) as BountyDetail;
  } catch (err) {
    console.error(
      `[bid show] Failed to fetch bounty: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }

  // Print bounty summary
  console.log(`\n${bounty.title}`);
  console.log(`${"=".repeat(Math.min(bounty.title.length, 60))}`);
  console.log(``);
  console.log(`  ID           : ${bounty.id}`);
  console.log(`  Status       : ${bounty.status}`);
  console.log(`  Type         : ${bounty.task_type}`);
  console.log(`  Language     : ${bounty.language}`);
  console.log(`  Bounty       : ${bounty.max_bounty_sats} sats`);
  console.log(`  Bid stake    : ${bounty.bid_stake_sats} sats`);
  console.log(`  Deadline in  : ${deadlineIn(bounty.deadline_at)}`);
  console.log(`  Bids         : ${bounty.bid_count} (${bounty.passing_bid_count} passing)`);
  console.log(``);
  console.log(`  Description:`);
  for (const line of bounty.description.split("\n")) {
    console.log(`    ${line}`);
  }
  console.log(``);

  // Parse and display task payload
  let payload: CodebasePayload | BugBountyPayload | null = null;
  if (bounty.task_payload) {
    try {
      payload = JSON.parse(bounty.task_payload) as CodebasePayload | BugBountyPayload;
    } catch {
      // Non-parseable payload, skip structured display
    }
  }

  if (bounty.task_type === "codebase" && payload) {
    const cb = payload as CodebasePayload;
    console.log(`  Test command : ${cb.test_command}`);
    if (cb.context_files?.length > 0) {
      console.log(`\n  Context files (${cb.context_files.length}):`);
      for (const f of cb.context_files) {
        const lines = countLines(f.content);
        console.log(`    ${f.path.padEnd(50)}  ${lines} lines`);
      }
    }
  } else if (bounty.task_type === "bug_bounty" && payload) {
    const bb = payload as BugBountyPayload;
    console.log(`  Symptom      : ${bb.symptom}`);
    if (bb.failing_input_example) {
      console.log(`  Example      : ${bb.failing_input_example}`);
    }
    console.log(`\n  Target code (${countLines(bb.target_code)} lines, ${bb.language})`);
  } else if (bounty.task_type === "snippet" && bounty.starter_code) {
    console.log(`\n  Starter code (${countLines(bounty.starter_code)} lines):`);
    const preview = bounty.starter_code.split("\n").slice(0, 10).join("\n");
    for (const line of preview.split("\n")) {
      console.log(`    ${line}`);
    }
    if (bounty.starter_code.split("\n").length > 10) {
      console.log(`    ... (${bounty.starter_code.split("\n").length - 10} more lines)`);
    }
  }

  console.log(``);

  // Download context files if requested
  if (opts.download && bounty.task_type === "codebase" && payload) {
    const cb = payload as CodebasePayload;
    const destDir = opts.download;

    if (!cb.context_files?.length) {
      console.log("[bid show] No context files to download.");
      return;
    }

    console.log(`Downloading ${cb.context_files.length} context files to ${destDir}...`);
    let written = 0;

    for (const f of cb.context_files) {
      const destPath = join(destDir, f.path);
      const destDirPath = dirname(destPath);
      try {
        mkdirSync(destDirPath, { recursive: true });
        writeFileSync(destPath, f.content, "utf-8");
        written++;
      } catch (err) {
        console.error(
          `  [!] Failed to write ${f.path}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    console.log(`Downloaded ${written}/${cb.context_files.length} files.`);
    console.log(`Test command: ${cb.test_command}`);
    console.log(``);
  } else if (opts.download && bounty.task_type !== "codebase") {
    console.log("[bid show] --download is only supported for codebase task type.");
  }
}
