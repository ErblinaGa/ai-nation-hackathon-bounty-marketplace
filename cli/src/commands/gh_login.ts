/**
 * [cli/gh_login] `lb gh-login`
 * Checks `gh auth status`. Prints username + scopes if authed,
 * exits 1 with instructions if not.
 */
import { ghAuthStatus } from "../github.js";

export async function runGhLogin(): Promise<void> {
  const info = await ghAuthStatus();

  if (!info.authenticated) {
    console.error("[gh-login] Not authenticated with GitHub CLI.");
    console.error("[gh-login] Run the following to authenticate:");
    console.error("[gh-login]   gh auth login");
    process.exit(1);
  }

  console.log(`\ngh auth: OK`);
  console.log(`  Username : ${info.username}`);
  console.log(`  Scopes   : ${info.scopes.join(", ") || "(none parsed)"}`);
  console.log(`\nYou're ready to use lb gh-* commands.`);
}
