/**
 * [cli/scan] `lb scan <owner/repo>`
 *
 * Flow:
 *  1. Clone repo to temp dir
 *  2. POST /api/scan → triggers scanner, gets candidate list
 *  3. Print formatted candidates table
 *  4. If --apply: POST /api/scan/apply with selected IDs
 *  5. If --browser: print scan-results URL (and open if possible)
 *  6. If --auto-apply <severity>: apply all candidates at that severity
 */
import { execFileSync } from "node:child_process";

const DEFAULT_API_BASE = "http://localhost:3000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScanCandidate {
  id: string;
  scan_id: string;
  repo: string;
  title: string;
  body: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  files_affected: string[];
  estimated_loc: number;
  suggested_sats: number;
  status: string;
}

interface ScanResponse {
  success: boolean;
  data?: {
    scan_id: string;
    repo: string;
    candidates: ScanCandidate[];
  };
  error?: string;
}

interface ApplyResponse {
  success: boolean;
  data?: {
    applied: Array<{
      candidate_id: string;
      bounty_id: string;
      issue_number: number;
      issue_url: string;
      error?: string;
    }>;
  };
  error?: string;
}

export interface ScanOpts {
  api: string;
  apply?: string;
  browser: boolean;
  autoApply?: string;
  max: string;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, string> = {
  HIGH: "\x1b[31m",    // red
  MEDIUM: "\x1b[33m",  // yellow
  LOW: "\x1b[36m",     // cyan
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function colorSeverity(sev: string): string {
  const col = SEVERITY_COLORS[sev] ?? "";
  return `${col}${sev.padEnd(6)}${RESET}`;
}

function formatSats(sats: number): string {
  if (sats >= 1000) return `${(sats / 1000).toFixed(0)}k`;
  return String(sats);
}

function printCandidates(candidates: ScanCandidate[]): void {
  console.log(`\n${BOLD}${candidates.length} candidates drafted:${RESET}`);
  console.log(`${DIM}${"─".repeat(72)}${RESET}`);

  candidates.forEach((c, idx) => {
    const num = `[${idx + 1}]`.padEnd(4);
    const sev = colorSeverity(c.severity);
    const sats = `${formatSats(c.suggested_sats)} sat`.padEnd(10);
    const title =
      c.title.length > 52 ? c.title.slice(0, 49) + "..." : c.title;

    console.log(`  ${num} ${sev}  ${sats}  ${title}`);
  });

  console.log(`${DIM}${"─".repeat(72)}${RESET}`);
}

function printApprovalOptions(scanId: string, apiBase: string): void {
  const host = apiBase.replace(/\/api$/, "").replace(/\/$/, "");
  console.log(`\n${BOLD}How to approve:${RESET}`);
  console.log(
    `  ${DIM}→${RESET} 'lb scan --apply 1,4,7'         ${DIM}(file these as bounties via CLI)${RESET}`,
  );
  console.log(
    `  ${DIM}→${RESET} 'lb scan --browser'              ${DIM}(open UI for review)${RESET}`,
  );
  console.log(
    `  ${DIM}→${RESET} 'lb scan --auto-apply HIGH'      ${DIM}(auto-file all HIGH severity ones)${RESET}`,
  );
  console.log(
    `\n  ${DIM}Scan ID: ${scanId}${RESET}`,
  );
  console.log(
    `  ${DIM}UI URL:  ${host}/scan-results?scan_id=${scanId}${RESET}`,
  );
  console.log(``);
}

// ---------------------------------------------------------------------------
// Scan + apply
// ---------------------------------------------------------------------------

async function runScan(
  apiBase: string,
  repo: string,
  maxCandidates: number,
): Promise<ScanResponse> {
  console.log(`\nlb scan ${repo}`);
  console.log(`[scan] Posting scan request to ${apiBase}...`);

  // apiBase may end with /api (from DEFAULT_API_BASE) or be a bare host.
  // Normalize: if it already ends with /api, use it directly; else append /api.
  const base = apiBase.endsWith("/api") ? apiBase : `${apiBase}/api`;

  let response: Response;
  try {
    response = await fetch(`${base}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo, max_candidates: maxCandidates }),
    });
  } catch (err) {
    throw new Error(
      `[scan] Network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    result = {};
  }

  if (!response.ok) {
    const errMsg =
      (result as { error?: string })?.error ?? `HTTP ${response.status}`;
    throw new Error(`[scan] API error: ${errMsg}`);
  }

  return result as ScanResponse;
}

async function applySelected(
  apiBase: string,
  candidateIds: string[],
): Promise<ApplyResponse> {
  const base = apiBase.endsWith("/api") ? apiBase : `${apiBase}/api`;
  let response: Response;
  try {
    response = await fetch(`${base}/scan/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate_ids: candidateIds }),
    });
  } catch (err) {
    throw new Error(
      `[scan --apply] Network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    result = {};
  }

  if (!response.ok) {
    const errMsg =
      (result as { error?: string })?.error ?? `HTTP ${response.status}`;
    throw new Error(`[scan --apply] API error: ${errMsg}`);
  }

  return result as ApplyResponse;
}

function tryOpenBrowser(url: string): void {
  // Try platform-specific open commands — non-fatal
  const cmds: [string, string[]][] = [
    ["open", [url]],     // macOS
    ["xdg-open", [url]], // Linux
    ["start", [url]],    // Windows
  ];
  for (const [cmd, args] of cmds) {
    try {
      execFileSync(cmd, args, { stdio: "ignore", timeout: 3000 });
      return;
    } catch {
      // try next
    }
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runScan_command(
  ownerRepo: string,
  opts: ScanOpts,
): Promise<void> {
  const apiBase = opts.api.replace(/\/$/, "");
  const maxCandidates = parseInt(opts.max, 10) || 8;

  if (!ownerRepo || !ownerRepo.includes("/")) {
    console.error("[scan] Error: argument must be 'owner/repo' format");
    process.exit(1);
  }

  // 1. Run scan
  let scanResult: ScanResponse;
  try {
    scanResult = await runScan(apiBase, ownerRepo, maxCandidates);
  } catch (err) {
    console.error(
      `[scan] Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  if (!scanResult.success || !scanResult.data) {
    console.error(`[scan] Scan failed: ${scanResult.error ?? "unknown error"}`);
    process.exit(1);
  }

  const { scan_id, candidates } = scanResult.data;

  if (candidates.length === 0) {
    console.log("[scan] No candidates found. The codebase looks clean!");
    return;
  }

  // 2. Print candidates
  printCandidates(candidates);

  // 3. Handle flags
  const host = apiBase.replace(/\/api$/, "").replace(/\/$/, "");

  if (opts.autoApply) {
    // --auto-apply HIGH|MEDIUM|LOW
    const targetSev = opts.autoApply.toUpperCase();
    if (!["HIGH", "MEDIUM", "LOW"].includes(targetSev)) {
      console.error(
        `[scan] --auto-apply must be HIGH, MEDIUM, or LOW (got: ${opts.autoApply})`,
      );
      process.exit(1);
    }

    const toApply = candidates.filter((c) => c.severity === targetSev);
    if (toApply.length === 0) {
      console.log(
        `[scan] No ${targetSev} severity candidates to apply.`,
      );
      return;
    }

    console.log(
      `\n[scan] Auto-applying ${toApply.length} ${targetSev} candidate(s)...`,
    );

    let applyResult: ApplyResponse;
    try {
      applyResult = await applySelected(
        apiBase,
        toApply.map((c) => c.id),
      );
    } catch (err) {
      console.error(
        `[scan] Apply error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }

    printApplyResults(applyResult, host);
    return;
  }

  if (opts.apply) {
    // --apply 1,4,7  (1-indexed)
    const indices = opts.apply
      .split(",")
      .map((s) => parseInt(s.trim(), 10) - 1)
      .filter((i) => !isNaN(i) && i >= 0 && i < candidates.length);

    if (indices.length === 0) {
      console.error(
        `[scan] --apply: no valid indices. Got: ${opts.apply} (expected 1-indexed, e.g. 1,3,5)`,
      );
      process.exit(1);
    }

    const toApply = indices.map((i) => candidates[i]);
    console.log(
      `\n[scan] Applying ${toApply.length} candidate(s): ${indices.map((i) => i + 1).join(", ")}`,
    );

    let applyResult: ApplyResponse;
    try {
      applyResult = await applySelected(
        apiBase,
        toApply.map((c) => c.id),
      );
    } catch (err) {
      console.error(
        `[scan] Apply error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }

    printApplyResults(applyResult, host);
    return;
  }

  if (opts.browser) {
    const url = `${host}/scan-results?scan_id=${scan_id}`;
    console.log(`\n[scan] Opening browser: ${url}`);
    tryOpenBrowser(url);
    return;
  }

  // Default: print how to approve
  printApprovalOptions(scan_id, apiBase);
}

function printApplyResults(applyResult: ApplyResponse, host: string): void {
  const applied = applyResult.data?.applied ?? [];
  const successes = applied.filter((a) => !a.error && a.bounty_id);
  const failures = applied.filter((a) => a.error);

  if (successes.length > 0) {
    console.log(`\n${BOLD}Filed ${successes.length} bounty(ies):${RESET}`);
    for (const a of successes) {
      console.log(
        `  Issue #${a.issue_number}   ${DIM}${a.issue_url}${RESET}`,
      );
      console.log(
        `  Bounty: ${a.bounty_id}   ${DIM}${host}/bounty/${a.bounty_id}${RESET}`,
      );
    }
  }

  if (failures.length > 0) {
    console.log(`\n${BOLD}Failed (${failures.length}):${RESET}`);
    for (const f of failures) {
      console.log(`  ${f.candidate_id}: ${f.error}`);
    }
  }

  console.log(``);
}
