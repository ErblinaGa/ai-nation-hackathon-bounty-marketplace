#!/usr/bin/env node
/**
 * [cli] lb — Lightning Bounty Marketplace CLI
 *
 * Poster commands:
 *   lb bounty "<task>" [--codebase <path>] [--max-sats N] ...
 *   lb gh-login
 *   lb gh-connect <owner/repo>
 *   lb gh-bounty <owner/repo>#<issue-number>
 *   lb gh-pr <bounty-id>
 *   lb gh-merge <bounty-id>
 *   lb gh-revert <bounty-id>
 *   lb scan <owner/repo>
 *
 * Bidder commands (V4):
 *   lb auth login / status / logout
 *   lb bounties [--task-type ...] [--language ...] [--json]
 *   lb watch [--json] [--filter-language ...] [--filter-min-sats N]
 *   lb bid show <bounty-id> [--download <dir>]
 *   lb bid test <bounty-id> <diff-file>
 *   lb bid submit <bounty-id> <diff-file> [--auto-pay-stake]
 *   lb bid status <bid-id> [--watch]
 *   lb bids [--json] [--limit N]
 *   lb wallet balance / history / receive <n> / send <pubkey> <n>
 */
import { Command } from "commander";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { extractContext } from "./context_extractor.js";

// Load .env from the project root so ANTHROPIC_API_KEY etc. are available to context_extractor
loadDotenv({ path: resolve(process.cwd(), ".env") });

// Poster commands
import { runGhLogin } from "./commands/gh_login.js";
import { runGhConnect } from "./commands/gh_connect.js";
import { runGhBounty } from "./commands/gh_bounty.js";
import { runGhPr } from "./commands/gh_pr.js";
import { runGhMerge } from "./commands/gh_merge.js";
import type { MergeStrategy } from "./commands/gh_merge.js";
import { runGhRevert } from "./commands/gh_revert.js";
import { runScan_command } from "./commands/scan.js";
import type { ScanOpts } from "./commands/scan.js";

// Bidder commands (V4)
import { runAuthLogin } from "./commands/auth_login.js";
import { runAuthStatus } from "./commands/auth_status.js";
import { runAuthLogout } from "./commands/auth_logout.js";
import { runBounties } from "./commands/bounties.js";
import type { BountiesOpts } from "./commands/bounties.js";
import { runWatch } from "./commands/watch.js";
import type { WatchOpts } from "./commands/watch.js";
import { runBidShow } from "./commands/bid_show.js";
import type { BidShowOpts } from "./commands/bid_show.js";
import { runBidTest } from "./commands/bid_test.js";
import type { BidTestOpts } from "./commands/bid_test.js";
import { runBidSubmit } from "./commands/bid_submit.js";
import type { BidSubmitOpts } from "./commands/bid_submit.js";
import { runBidStatus } from "./commands/bid_status.js";
import type { BidStatusOpts } from "./commands/bid_status.js";
import { runBids } from "./commands/bids.js";
import type { BidsOpts } from "./commands/bids.js";
import {
  runWalletBalance,
  runWalletHistory,
  runWalletReceive,
  runWalletSend,
} from "./commands/wallet.js";

const DEMO_POSTER_PUBKEY = "02demo_poster_pubkey";
const DEFAULT_API_BASE = "http://localhost:3000/api";

// ---------------------------------------------------------------------------
// API types (subset matching lib/types.ts)
// ---------------------------------------------------------------------------

interface CodebasePayload {
  codebase_id: string;
  context_files: Array<{ path: string; content: string }>;
  test_command: string;
  task_description: string;
}

interface PostBountyRequest {
  poster_pubkey: string;
  title: string;
  description: string;
  language: string;
  task_type: string;
  task_payload: CodebasePayload;
  test_suite: string;
  max_bounty_sats: number;
  deadline_minutes?: number;
}

interface PostBountyResponse {
  bounty_id: string;
  test_suite_hash: string;
  poster_stake_invoice: string;
  poster_stake_payment_hash: string;
  deadline_at: string;
  status: string;
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function postBounty(
  apiBase: string,
  body: PostBountyRequest,
): Promise<PostBountyResponse> {
  const url = `${apiBase.replace(/\/$/, "")}/bounty`;
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `[cli][postBounty] Network error posting to ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    let errorText = "";
    try {
      errorText = await response.text();
    } catch {
      errorText = "(could not read error body)";
    }
    throw new Error(
      `[cli][postBounty] API returned ${response.status} ${response.statusText}: ${errorText}`,
    );
  }

  try {
    const data = (await response.json()) as PostBountyResponse;
    return data;
  } catch (err) {
    throw new Error(
      `[cli][postBounty] Failed to parse API response: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// bounty command
// ---------------------------------------------------------------------------

async function runBountyCommand(
  taskDescription: string,
  opts: {
    codebase: string;
    maxSats: string;
    deadlineMin: string;
    api: string;
    testCommand: string;
    language: string;
    title: string | undefined;
  },
): Promise<void> {
  const codebaseDir = resolve(opts.codebase);
  const maxSats = parseInt(opts.maxSats, 10);
  const deadlineMin = parseInt(opts.deadlineMin, 10);
  const apiBase = opts.api;
  const language = opts.language;
  const title = opts.title ?? taskDescription.slice(0, 80);
  const testCommand = opts.testCommand;

  // Validate inputs
  if (!taskDescription || taskDescription.trim().length === 0) {
    console.error("[cli] Error: task description cannot be empty");
    process.exit(1);
  }
  if (isNaN(maxSats) || maxSats <= 0) {
    console.error("[cli] Error: --max-sats must be a positive integer");
    process.exit(1);
  }
  if (isNaN(deadlineMin) || deadlineMin <= 0) {
    console.error("[cli] Error: --deadline-min must be a positive integer");
    process.exit(1);
  }

  console.log(`\nlb bounty`);
  console.log(`  task       : ${taskDescription}`);
  console.log(`  codebase   : ${codebaseDir}`);
  console.log(`  max sats   : ${maxSats}`);
  console.log(`  deadline   : ${deadlineMin} minutes`);
  console.log(`  api        : ${apiBase}`);
  console.log(`  language   : ${language}`);
  console.log(`  title      : ${title}`);
  console.log(``);

  // Step 1+2+3: Extract relevant context files via Claude Haiku
  let contextFiles: Array<{ path: string; content: string }>;
  try {
    contextFiles = await extractContext(codebaseDir, taskDescription);
  } catch (err) {
    console.error(
      `[cli] Error extracting codebase context: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  if (contextFiles.length === 0) {
    console.warn(
      "[cli] Warning: no context files extracted — posting bounty without codebase context",
    );
  }

  // Use codebase directory name as codebase_id
  const codebaseId = codebaseDir.split("/").pop() ?? "unknown";

  // Step 4: Build payload and POST
  const taskPayload: CodebasePayload = {
    codebase_id: codebaseId,
    context_files: contextFiles,
    test_command: testCommand,
    task_description: taskDescription,
  };

  const requestBody: PostBountyRequest = {
    poster_pubkey: DEMO_POSTER_PUBKEY,
    title,
    description: taskDescription,
    language,
    task_type: "codebase",
    task_payload: taskPayload,
    // For codebase tasks the test_suite field is a placeholder — real tests are in payload.
    test_suite: `// codebase task — run: ${testCommand}`,
    max_bounty_sats: maxSats,
    deadline_minutes: deadlineMin,
  };

  console.log(`[cli] Posting bounty to ${apiBase}...`);
  let result: PostBountyResponse;
  try {
    result = await postBounty(apiBase, requestBody);
  } catch (err) {
    console.error(
      `[cli] Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  // Step 5: Print results
  const apiHost = apiBase.replace(/\/api$/, "").replace(/\/$/, "");
  const bountyUrl = `${apiHost}/bounty/${result.bounty_id}`;

  console.log(`\nBounty posted successfully!`);
  console.log(`  Bounty ID  : ${result.bounty_id}`);
  console.log(`  Status     : ${result.status}`);
  console.log(`  Deadline   : ${result.deadline_at}`);
  console.log(`  Invoice    : ${result.poster_stake_invoice}`);
  console.log(`  Demo URL   : ${bountyUrl}`);
  console.log(`  Hash       : ${result.poster_stake_payment_hash}`);
  console.log(``);
  console.log(`Context files included (${contextFiles.length}):`);
  for (const f of contextFiles) {
    console.log(`  - ${f.path} (${f.content.length} chars)`);
  }
}

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("lb")
  .description("Lightning Bounty Marketplace CLI")
  .version("0.1.0");

program
  .command("bounty <task>")
  .description(
    "Post a codebase bounty. Extracts relevant files and posts to the marketplace.",
  )
  .option(
    "--codebase <path>",
    "Path to the codebase root (default: current directory)",
    process.cwd(),
  )
  .option("--max-sats <n>", "Maximum bounty in satoshis", "5000")
  .option("--deadline-min <n>", "Deadline in minutes from now", "60")
  .option("--api <url>", "API base URL", DEFAULT_API_BASE)
  .option(
    "--test-command <cmd>",
    "Command to run tests after diff is applied",
    "npm test",
  )
  .option(
    "--language <lang>",
    "Codebase language: typescript | python",
    "typescript",
  )
  .option("--title <title>", "Bounty title (defaults to first 80 chars of task)")
  .action(
    async (
      task: string,
      opts: {
        codebase: string;
        maxSats: string;
        deadlineMin: string;
        api: string;
        testCommand: string;
        language: string;
        title: string | undefined;
      },
    ) => {
      try {
        await runBountyCommand(task, opts);
      } catch (err) {
        console.error(
          `[cli] Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
        );
        if (err instanceof Error && err.stack) {
          console.error(err.stack);
        }
        process.exit(1);
      }
    },
  );

// ---------------------------------------------------------------------------
// gh-login command
// ---------------------------------------------------------------------------

program
  .command("gh-login")
  .description("Check gh CLI authentication status. Prompts to run gh auth login if not authed.")
  .action(async () => {
    try {
      await runGhLogin();
    } catch (err) {
      console.error(
        `[cli] Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// gh-connect command
// ---------------------------------------------------------------------------

program
  .command("gh-connect <owner/repo>")
  .description("Register a GitHub repo with the Lightning Bounty Marketplace.")
  .option("--api <url>", "API base URL", "http://localhost:3000")
  .action(async (ownerRepo: string, opts: { api: string }) => {
    try {
      await runGhConnect(ownerRepo, opts);
    } catch (err) {
      console.error(
        `[cli] Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// gh-bounty command
// ---------------------------------------------------------------------------

program
  .command("gh-bounty <owner/repo#issue>")
  .description(
    "Post a GitHub issue as a bounty. Fetches issue, clones repo, extracts context. Omit --max-sats to auto-estimate.",
  )
  .option("--api <url>", "API base URL", "http://localhost:3000")
  .option(
    "--max-sats <n>",
    "Maximum bounty in satoshis. Omit or set to 0 to auto-estimate via complexity analysis.",
    "0",
  )
  .option("--deadline-min <n>", "Deadline in minutes from now", "10")
  .option(
    "--test-command <cmd>",
    "Command to run tests after diff is applied",
    "npm test -- --run",
  )
  .option(
    "--language <lang>",
    "Codebase language: typescript | python",
    "typescript",
  )
  .option(
    "--auto",
    "Skip estimator output and use suggested sat amount silently (for scripted/batch use).",
    false,
  )
  .action(
    async (
      repoIssue: string,
      opts: {
        api: string;
        maxSats: string;
        deadlineMin: string;
        testCommand: string;
        language: string;
        auto: boolean;
      },
    ) => {
      try {
        await runGhBounty(repoIssue, opts);
      } catch (err) {
        console.error(
          `[cli] Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
        );
        if (err instanceof Error && err.stack) {
          console.error(err.stack);
        }
        process.exit(1);
      }
    },
  );

// ---------------------------------------------------------------------------
// gh-pr command
// ---------------------------------------------------------------------------

program
  .command("gh-pr <bounty-id>")
  .description(
    "Manual trigger: open a PR for a settled GitHub bounty. Auto-PR handles this in Phase 4.",
  )
  .option("--api <url>", "API base URL", "http://localhost:3000")
  .action(async (bountyId: string, opts: { api: string }) => {
    try {
      await runGhPr(bountyId, opts);
    } catch (err) {
      console.error(
        `[cli] Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// gh-merge command
// ---------------------------------------------------------------------------

program
  .command("gh-merge <bounty-id>")
  .description(
    "Merge an open PR for a settled GitHub bounty and record the merge timestamp in the DB.",
  )
  .option("--api <url>", "API base URL", "http://localhost:3000")
  .option(
    "--strategy <strategy>",
    "Merge strategy: squash | merge | rebase",
    "squash",
  )
  .action(async (bountyId: string, opts: { api: string; strategy: string }) => {
    try {
      const strategy = opts.strategy as MergeStrategy;
      if (!["squash", "merge", "rebase"].includes(strategy)) {
        console.error(`[cli] Invalid --strategy "${strategy}". Must be squash, merge, or rebase.`);
        process.exit(1);
      }
      await runGhMerge(bountyId, { api: opts.api, strategy });
    } catch (err) {
      console.error(
        `[cli] Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// gh-revert command
// ---------------------------------------------------------------------------

program
  .command("gh-revert <bounty-id>")
  .description(
    "Open a revert PR for a settled + merged GitHub bounty. Winner keeps the sats.",
  )
  .option("--api <url>", "API base URL", "http://localhost:3000")
  .action(async (bountyId: string, opts: { api: string }) => {
    try {
      await runGhRevert(bountyId, { api: opts.api });
    } catch (err) {
      console.error(
        `[cli] Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// scan command
// ---------------------------------------------------------------------------

program
  .command("scan <owner/repo>")
  .description(
    "Scan a GitHub repo with AI, draft improvement candidates, optionally file as bounties.",
  )
  .option("--api <url>", "API base URL", DEFAULT_API_BASE)
  .option(
    "--apply <ids>",
    "Comma-separated 1-indexed candidate IDs to apply (e.g. 1,3,5)",
  )
  .option(
    "--browser",
    "Print the scan-results URL and open in browser",
    false,
  )
  .option(
    "--auto-apply <severity>",
    "Auto-file all candidates of given severity: HIGH | MEDIUM | LOW",
  )
  .option("--max <n>", "Max candidates to draft (1–10)", "8")
  .action(async (ownerRepo: string, opts: ScanOpts) => {
    try {
      await runScan_command(ownerRepo, opts);
    } catch (err) {
      console.error(
        `[cli] Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      );
      if (err instanceof Error && err.stack) {
        console.error(err.stack);
      }
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// auth commands (V4)
// ---------------------------------------------------------------------------

const authCmd = program
  .command("auth")
  .description("Authenticate with the Lightning Bounty Marketplace.");

authCmd
  .command("login")
  .description("Log in via magic link OTP. Stores API key in ~/.lb/config.json.")
  .option("--api <url>", "API base URL")
  .action(async () => {
    try {
      await runAuthLogin();
    } catch (err) {
      console.error(`[cli] Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

authCmd
  .command("status")
  .description("Show current authentication status.")
  .option("--api <url>", "API base URL")
  .action(async () => {
    try {
      await runAuthStatus();
    } catch (err) {
      console.error(`[cli] Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

authCmd
  .command("logout")
  .description("Remove stored credentials (deletes ~/.lb/config.json).")
  .action(() => {
    runAuthLogout();
  });

// ---------------------------------------------------------------------------
// bounties command (V4)
// ---------------------------------------------------------------------------

program
  .command("bounties")
  .description("List open bounties.")
  .option("--task-type <type>", "Filter by type: snippet|codebase|bug_bounty|free_form")
  .option("--language <lang>", "Filter by language: ts|python")
  .option("--json", "Output NDJSON (one bounty per line, for piping into scripts)")
  .option("--api <url>", "API base URL")
  .action(async (opts: BountiesOpts & { api?: string; taskType?: string; language?: string; json?: boolean }) => {
    try {
      await runBounties(opts);
    } catch (err) {
      console.error(`[cli] Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// watch command (V4)
// ---------------------------------------------------------------------------

program
  .command("watch")
  .description("Long-poll for new bounties, print as they appear. Agent daemon mode.")
  .option("--json", "Output NDJSON (stream-clean, for piping into agent scripts)")
  .option("--filter-language <lang>", "Only show ts|python bounties")
  .option("--filter-min-sats <n>", "Only show bounties >= N sats")
  .option("--interval <ms>", "Poll interval in milliseconds (default: 4000)")
  .option("--api <url>", "API base URL")
  .action(async (opts: WatchOpts) => {
    try {
      await runWatch(opts);
    } catch (err) {
      console.error(`[cli] Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// bid commands (V4)
// ---------------------------------------------------------------------------

const bidCmd = program
  .command("bid")
  .description("Bidder workflow: inspect, test, submit, and track bids.");

bidCmd
  .command("show <bounty-id>")
  .description("Show full bounty details including context_files.")
  .option("--download <dir>", "Download context_files to this directory for local work")
  .option("--api <url>", "API base URL")
  .action(async (bountyId: string, opts: BidShowOpts) => {
    try {
      await runBidShow(bountyId, opts);
    } catch (err) {
      console.error(`[cli] Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

bidCmd
  .command("test <bounty-id> <diff-file>")
  .description("Run the sandbox locally. Does NOT submit — purely a pre-flight check.")
  .option("--api <url>", "API base URL")
  .action(async (bountyId: string, diffFile: string, opts: BidTestOpts) => {
    try {
      await runBidTest(bountyId, diffFile, opts);
    } catch (err) {
      console.error(`[cli] Error: ${err instanceof Error ? err.message : String(err)}`);
      if (err instanceof Error && err.stack) console.error(err.stack);
      process.exit(1);
    }
  });

bidCmd
  .command("submit <bounty-id> <diff-file>")
  .description("Submit a bid (unified diff). Uses x-api-key from ~/.lb/config.json.")
  .option("--auto-pay-stake", "Debit stake from ledger automatically on submit", false)
  .option("--api <url>", "API base URL")
  .action(async (bountyId: string, diffFile: string, opts: BidSubmitOpts & { autoPayStake?: boolean }) => {
    try {
      await runBidSubmit(bountyId, diffFile, opts);
    } catch (err) {
      console.error(`[cli] Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

bidCmd
  .command("status <bid-id>")
  .description("Check bid status. Use --watch to poll until terminal state.")
  .option("--watch", "Keep polling until PASS/FAIL/WON/LOST/REFUNDED")
  .option("--api <url>", "API base URL")
  .action(async (bidId: string, opts: BidStatusOpts) => {
    try {
      await runBidStatus(bidId, opts);
    } catch (err) {
      console.error(`[cli] Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// bids command (V4)
// ---------------------------------------------------------------------------

program
  .command("bids")
  .description("List your bid history.")
  .option("--json", "Output NDJSON")
  .option("--limit <n>", "Max bids to return (default: 50)")
  .option("--api <url>", "API base URL")
  .action(async (opts: BidsOpts) => {
    try {
      await runBids(opts);
    } catch (err) {
      console.error(`[cli] Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// wallet commands (V4)
// ---------------------------------------------------------------------------

const walletCmd = program
  .command("wallet")
  .description("Manage your marketplace wallet.");

walletCmd
  .command("balance")
  .description("Show available and locked sats.")
  .option("--api <url>", "API base URL")
  .action(async (opts: { api?: string }) => {
    try {
      await runWalletBalance(opts);
    } catch (err) {
      console.error(`[cli] Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

walletCmd
  .command("history")
  .description("Show last N transactions.")
  .option("--limit <n>", "Max transactions (default: 20)")
  .option("--api <url>", "API base URL")
  .action(async (opts: { limit?: string; api?: string }) => {
    try {
      await runWalletHistory(opts);
    } catch (err) {
      console.error(`[cli] Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

walletCmd
  .command("receive <amount>")
  .description("Generate a top-up invoice for <amount> sats. In stub mode, credits instantly.")
  .option("--api <url>", "API base URL")
  .action(async (amount: string, opts: { api?: string }) => {
    try {
      await runWalletReceive(amount, opts);
    } catch (err) {
      console.error(`[cli] Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

walletCmd
  .command("send <pubkey> <amount>")
  .description("Send sats to another marketplace participant by pubkey.")
  .option("--api <url>", "API base URL")
  .action(async (pubkey: string, amount: string, opts: { api?: string }) => {
    try {
      await runWalletSend(pubkey, amount, opts);
    } catch (err) {
      console.error(`[cli] Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
