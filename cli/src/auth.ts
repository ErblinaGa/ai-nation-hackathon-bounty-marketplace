/**
 * [cli/auth] Authentication helpers for bidder CLI commands.
 *
 * Reads API key + config from ~/.lb/config.json.
 * Falls back to demo pubkey in stub mode if no key is configured.
 */
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_API_BASE = "http://localhost:3000/api";
export const DEMO_BIDDER_PUBKEY = "02demo_bidder_pubkey";

export interface LbConfig {
  api_key: string;
  email: string;
  api_base?: string;
}

function getConfigPath(): string {
  return join(homedir(), ".lb", "config.json");
}

/**
 * [auth][readConfig] Read config from ~/.lb/config.json.
 * Returns null if file does not exist.
 */
export function readConfig(): LbConfig | null {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return null;

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as LbConfig;
    if (!parsed.api_key || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * [auth][writeConfig] Persist config to ~/.lb/config.json with chmod 600.
 */
export function writeConfig(config: LbConfig): void {
  const lbDir = join(homedir(), ".lb");
  if (!existsSync(lbDir)) {
    mkdirSync(lbDir, { mode: 0o700, recursive: true });
  }

  const configPath = getConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

  try {
    chmodSync(configPath, 0o600);
  } catch {
    // Non-fatal on Windows
  }
}

/**
 * [auth][deleteConfig] Remove ~/.lb/config.json (logout).
 */
export function deleteConfig(): void {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return;
  try {
    rmSync(configPath);
  } catch {
    // Already gone
  }
}

/**
 * [auth][getApiKey] Return the stored API key, or throw if not authenticated.
 * In stub mode with no key, returns a demo key so commands work without login.
 */
export function getApiKey(): string {
  const config = readConfig();
  if (config?.api_key) return config.api_key;

  // Stub-mode fallback: allow unauthenticated use with demo key
  const apiBase = getApiBase();
  if (apiBase.includes("localhost")) {
    return "stub_demo";
  }

  throw new Error("Not authenticated — run: lb auth login");
}

/**
 * [auth][getApiBase] Return the API base URL.
 * Reads from config, then from LB_API env, then defaults to localhost.
 */
export function getApiBase(): string {
  const config = readConfig();
  if (config?.api_base) return config.api_base;
  return process.env.LB_API ?? DEFAULT_API_BASE;
}

/**
 * [auth][withAuth] Return headers including x-api-key.
 * Does NOT add Content-Type by default — callers add it for POST/PUT bodies.
 * Safe to call even when unauthenticated in stub mode.
 */
export function withAuth(extra?: Record<string, string>): Record<string, string> {
  const config = readConfig();
  const headers: Record<string, string> = { ...extra };

  if (config?.api_key) {
    headers["x-api-key"] = config.api_key;
  }

  return headers;
}

/**
 * [auth][requireAuth] Like withAuth but throws if no API key is stored.
 * Use this for commands that strictly need authentication.
 * Does NOT add Content-Type — callers add it for POST bodies.
 */
export function requireAuth(): Record<string, string> {
  const apiKey = getApiKey();
  return { "x-api-key": apiKey };
}
