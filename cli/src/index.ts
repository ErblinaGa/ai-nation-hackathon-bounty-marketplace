#!/usr/bin/env node
/**
 * [cli] lb — Lightning Bounty Marketplace CLI
 *
 * Commands:
 *   lb bounty "<task>" [--codebase <path>] [--max-sats N] ...
 *   lb gh-login
 *   lb gh-connect <owner/repo>
 *   lb gh-bounty <owner/repo>#<issue-number>
 *   lb gh-pr <bounty-id>
 */
import { Command } from "commander";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { extractContext } from "./context_extractor.js";

// Load .env from the project root so ANTHROPIC_API_KEY etc. are available to context_extractor
loadDotenv({ path: resolve(process.cwd(), ".env") });
import { runGhLogin } from "./commands/gh_login.js";
import { runGhConnect } from "./commands/gh_connect.js";
import { runGhBounty } from "./commands/gh_bounty.js";
import { runGhPr } from "./commands/gh_pr.js";
import { runGhMerge } from "./commands/gh_merge.js";
import type { MergeStrategy } from "./commands/gh_merge.js";
import { runGhRevert } from "./commands/gh_revert.js";
import { runScan_command } from "./commands/scan.js";
import type { ScanOpts } from "./commands/scan.js";

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

program.parse(process.argv);
