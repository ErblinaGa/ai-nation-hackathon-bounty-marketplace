/**
 * [cli/gh_connect] `lb gh-connect <owner/repo>`
 * Fetches repo metadata via gh CLI, registers it with the marketplace API.
 */
import { ghRepoMeta, requireAuth } from "../github.js";

const DEFAULT_API_BASE = "http://localhost:3000";
const DEMO_POSTER_PUBKEY = "02demo_poster_pubkey";

interface ConnectOpts {
  api: string;
}

/**
 * [cli/gh_connect][parseOwnerRepo] Splits "owner/repo" string. Throws on bad format.
 */
function parseOwnerRepo(arg: string): { owner: string; repo: string } {
  const parts = arg.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `[gh-connect] Invalid repo format: "${arg}". Expected "owner/repo" (e.g. boaharis/lightning-bounty-demo)`,
    );
  }
  return { owner: parts[0], repo: parts[1] };
}

export async function runGhConnect(
  ownerRepo: string,
  opts: ConnectOpts,
): Promise<void> {
  // Auth guard
  const auth = await requireAuth();

  const { owner, repo } = parseOwnerRepo(ownerRepo);
  const apiBase = opts.api.replace(/\/$/, "");

  console.log(`\nlb gh-connect`);
  console.log(`  repo     : ${owner}/${repo}`);
  console.log(`  api      : ${apiBase}`);
  console.log(``);

  // Fetch repo metadata from GitHub
  console.log(`[gh-connect] Fetching repo metadata from GitHub...`);
  let meta: Awaited<ReturnType<typeof ghRepoMeta>>;
  try {
    meta = await ghRepoMeta(`${owner}/${repo}`);
  } catch (err) {
    console.error(
      `[gh-connect] Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  const defaultBranch = meta.defaultBranchRef?.name ?? "main";
  const description = meta.description ?? null;

  console.log(`  default_branch : ${defaultBranch}`);
  console.log(`  description    : ${description ?? "(none)"}`);
  console.log(``);

  // POST to /api/repos
  const url = `${apiBase}/api/repos`;
  const body = {
    owner,
    repo,
    github_username: auth.username,
    default_branch: defaultBranch,
    description,
    poster_pubkey: DEMO_POSTER_PUBKEY,
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(
      `[gh-connect] Network error: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
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
    console.error(`[gh-connect] API error: ${errMsg}`);
    process.exit(1);
  }

  const data = result as { id?: string; owner?: string; repo?: string };
  console.log(`Repo connected successfully!`);
  console.log(`  ID       : ${data.id ?? "(unknown)"}`);
  console.log(`  Repo     : ${owner}/${repo}`);
  console.log(`  Branch   : ${defaultBranch}`);
  console.log(`  Auth as  : @${auth.username}`);
  console.log(``);
  console.log(`Visible at: ${apiBase}/repos/${owner}/${repo}`);
}

// Re-export DEFAULT_API_BASE for index.ts
export { DEFAULT_API_BASE as GH_CONNECT_DEFAULT_API_BASE };
