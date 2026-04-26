/**
 * [cli/auth_login] `lb auth login`
 *
 * Flow:
 *  1. Prompt for email
 *  2. POST /api/auth/cli-init { email } — triggers Supabase OTP email
 *  3. Prompt for 6-digit code
 *  4. POST /api/auth/cli-verify { email, code } — returns api_key
 *  5. Persist api_key + email to ~/.lb/config.json (chmod 600)
 */
import { createInterface } from "node:readline";
import { writeConfig, getApiBase } from "../auth.js";

interface CliInitResponse {
  sent: boolean;
  message: string;
}

interface CliVerifyResponse {
  success: boolean;
  api_key: string;
  user_id: string;
  email: string;
  display_name: string | null;
  error?: string;
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function runAuthLogin(): Promise<void> {
  const apiBase = getApiBase();

  console.log(`\nlb auth login`);
  console.log(`  api: ${apiBase}`);
  console.log(``);

  // Step 1: Prompt for email
  const email = await prompt("Email address: ");
  if (!email || !email.includes("@")) {
    console.error("[auth login] Invalid email address");
    process.exit(1);
  }

  // Step 2: POST /api/auth/cli-init
  console.log(`\nSending magic link to ${email}...`);
  let initResp: CliInitResponse;
  try {
    const res = await fetch(`${apiBase}/auth/cli-init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as { error?: string };
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    initResp = (await res.json()) as CliInitResponse;
  } catch (err) {
    console.error(
      `[auth login] Failed to initiate login: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }

  console.log(`\n${initResp.message}`);

  // Step 3: Prompt for 6-digit OTP
  const code = await prompt("Enter 6-digit code: ");
  if (!code || !/^\d{6}$/.test(code)) {
    console.error("[auth login] Code must be exactly 6 digits");
    process.exit(1);
  }

  // Step 4: POST /api/auth/cli-verify
  console.log(`\nVerifying code...`);
  let verifyResp: CliVerifyResponse;
  try {
    const res = await fetch(`${apiBase}/auth/cli-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    verifyResp = (await res.json()) as CliVerifyResponse;
    if (!res.ok || !verifyResp.success) {
      throw new Error(verifyResp.error ?? `HTTP ${res.status}`);
    }
  } catch (err) {
    console.error(
      `[auth login] Verification failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }

  // Step 5: Persist config
  writeConfig({
    api_key: verifyResp.api_key,
    email: verifyResp.email,
    api_base: apiBase,
  });

  console.log(`\nLogged in successfully!`);
  console.log(`  Email    : ${verifyResp.email}`);
  if (verifyResp.display_name) {
    console.log(`  Name     : ${verifyResp.display_name}`);
  }
  console.log(`  Key saved: ~/.lb/config.json`);
  console.log(``);
}
