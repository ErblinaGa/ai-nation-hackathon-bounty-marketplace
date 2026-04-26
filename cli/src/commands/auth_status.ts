/**
 * [cli/auth_status] `lb auth status`
 *
 * Reads ~/.lb/config.json and hits GET /api/auth/me to confirm the key is valid.
 * Prints email, display_name, lightning_pubkey, role.
 */
import { readConfig, getApiBase } from "../auth.js";

interface MeResponse {
  success: boolean;
  user: {
    id: string;
    email: string;
    display_name: string | null;
    lightning_pubkey: string | null;
    role: string | null;
  };
  error?: string;
}

export async function runAuthStatus(): Promise<void> {
  const config = readConfig();

  if (!config) {
    console.log("Not logged in. Run: lb auth login");
    process.exit(0);
  }

  const apiBase = config.api_base ?? getApiBase();

  try {
    const res = await fetch(`${apiBase}/auth/me`, {
      headers: { "x-api-key": config.api_key },
    });
    const data = (await res.json()) as MeResponse;

    if (!res.ok || !data.success) {
      console.log(`Logged in as: ${config.email}`);
      console.log(`API key: ${config.api_key.slice(0, 8)}...`);
      console.log(`Warning: could not verify key with server (${data.error ?? `HTTP ${res.status}`})`);
      return;
    }

    const user = data.user;
    console.log(`\nlb auth status`);
    console.log(`  Logged in    : yes`);
    console.log(`  Email        : ${user.email}`);
    if (user.display_name) {
      console.log(`  Display name : ${user.display_name}`);
    }
    if (user.lightning_pubkey) {
      console.log(`  Pubkey       : ${user.lightning_pubkey}`);
    }
    if (user.role) {
      console.log(`  Role         : ${user.role}`);
    }
    console.log(`  API base     : ${apiBase}`);
    console.log(``);
  } catch (err) {
    // Network error — print what we know from disk
    console.log(`Logged in as: ${config.email}`);
    console.log(`API key: ${config.api_key.slice(0, 8)}...`);
    console.log(`Warning: could not reach server — ${err instanceof Error ? err.message : String(err)}`);
  }
}
