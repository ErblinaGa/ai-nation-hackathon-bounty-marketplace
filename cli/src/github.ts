/**
 * [cli/github] Thin wrappers around the `gh` CLI via child_process.execFile.
 * All shell-out calls — no direct GitHub API fetch (gh CLI handles auth).
 * All commands use --json where available for parseable output.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Max ms to wait for any gh CLI call.
const GH_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

async function gh(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("gh", args, {
      timeout: GH_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024, // 10 MB — large repos may have big output
    });
    return stdout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[cli/github][gh ${args[0]}] gh CLI error: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface GhAuthInfo {
  authenticated: boolean;
  username: string;
  scopes: string[];
  rawOutput: string;
}

/**
 * [cli/github][ghAuthStatus] Checks `gh auth status --json`.
 * Returns parsed auth info. Never throws — returns authenticated:false on error.
 */
export async function ghAuthStatus(): Promise<GhAuthInfo> {
  try {
    // gh auth status --active returns JSON in newer gh versions
    // Fallback: parse text output
    let raw = "";
    try {
      raw = await gh(["auth", "status", "--active"]);
    } catch {
      // older gh CLI — try without --active
      raw = await gh(["auth", "status"]);
    }

    // Parse: "✓ Logged in to github.com account <user>"
    const userMatch = raw.match(/Logged in to github\.com account (\S+)/);
    const scopesMatch = raw.match(/Token scopes: '([^']+)'/);
    const username = userMatch?.[1] ?? "";
    const scopes = scopesMatch?.[1]?.split("', '") ?? [];

    return {
      authenticated: !!username,
      username,
      scopes,
      rawOutput: raw,
    };
  } catch {
    return { authenticated: false, username: "", scopes: [], rawOutput: "" };
  }
}

// ---------------------------------------------------------------------------
// Issue
// ---------------------------------------------------------------------------

export interface GhIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  url: string;
}

/**
 * [cli/github][ghIssueView] Fetches issue metadata via `gh issue view --json`.
 */
export async function ghIssueView(
  repo: string,
  issueNumber: number,
): Promise<GhIssue> {
  const raw = await gh([
    "issue",
    "view",
    String(issueNumber),
    "--repo",
    repo,
    "--json",
    "number,title,body,state,url",
  ]);

  try {
    const parsed = JSON.parse(raw) as GhIssue;
    return parsed;
  } catch (err) {
    throw new Error(
      `[cli/github][ghIssueView] Failed to parse issue JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Repo metadata
// ---------------------------------------------------------------------------

export interface GhRepoMeta {
  name: string;
  owner: { login: string };
  description: string | null;
  defaultBranchRef: { name: string } | null;
}

/**
 * [cli/github][ghRepoMeta] Fetches repo metadata via `gh repo view --json`.
 */
export async function ghRepoMeta(repo: string): Promise<GhRepoMeta> {
  const raw = await gh([
    "repo",
    "view",
    repo,
    "--json",
    "name,owner,description,defaultBranchRef",
  ]);

  try {
    const parsed = JSON.parse(raw) as GhRepoMeta;
    return parsed;
  } catch (err) {
    throw new Error(
      `[cli/github][ghRepoMeta] Failed to parse repo JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Clone
// ---------------------------------------------------------------------------

/**
 * [cli/github][ghRepoClone] Clones repo into dest via `gh repo clone`.
 * dest must be an absolute path that does NOT yet exist (gh creates it).
 */
export async function ghRepoClone(repo: string, dest: string): Promise<void> {
  // gh repo clone <owner/repo> <dest>
  await gh(["repo", "clone", repo, dest, "--", "--depth=1", "--quiet"]);
}

// ---------------------------------------------------------------------------
// PR creation
// ---------------------------------------------------------------------------

export interface GhPRCreateOptions {
  repo: string;          // "owner/repo"
  head: string;          // branch name to PR from
  base: string;          // target branch (e.g. "main")
  title: string;
  body: string;
}

export interface GhPRCreateResult {
  url: string;
  number: number;
}

/**
 * [cli/github][ghPullRequestCreate] Opens a pull request via `gh pr create --json`.
 */
export async function ghPullRequestCreate(
  opts: GhPRCreateOptions,
): Promise<GhPRCreateResult> {
  // gh pr create prints PR URL to stdout (no --json on create).
  // After creation, gh pr view <url> --json gets structured info.
  const createOut = (await gh([
    "pr",
    "create",
    "--repo",
    opts.repo,
    "--head",
    opts.head,
    "--base",
    opts.base,
    "--title",
    opts.title,
    "--body",
    opts.body,
  ])).trim().split("\n").pop() || "";

  if (!createOut.startsWith("http")) {
    return { url: createOut, number: 0 };
  }

  const raw = await gh(["pr", "view", createOut, "--json", "url,number"]);

  try {
    const parsed = JSON.parse(raw) as GhPRCreateResult;
    return parsed;
  } catch (err) {
    throw new Error(
      `[cli/github][ghPullRequestCreate] Failed to parse PR JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Issue comment
// ---------------------------------------------------------------------------

/**
 * [cli/github][ghIssueComment] Posts a comment on an issue.
 */
export async function ghIssueComment(
  repo: string,
  issueNumber: number,
  body: string,
): Promise<void> {
  await gh(["issue", "comment", String(issueNumber), "--repo", repo, "--body", body]);
}

// ---------------------------------------------------------------------------
// Auth guard — fail fast for commands that require auth
// ---------------------------------------------------------------------------

/**
 * [cli/github][requireAuth] Checks auth, throws with instructions if not logged in.
 * Call at the top of every gh-* command that needs a valid session.
 */
export async function requireAuth(): Promise<GhAuthInfo> {
  const info = await ghAuthStatus();
  if (!info.authenticated) {
    throw new Error(
      "[cli/github][requireAuth] Not authenticated with GitHub. Run: gh auth login",
    );
  }
  return info;
}
