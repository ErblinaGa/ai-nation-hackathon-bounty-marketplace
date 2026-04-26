/**
 * [cli/auth_logout] `lb auth logout`
 *
 * Removes ~/.lb/config.json.
 */
import { deleteConfig, readConfig } from "../auth.js";

export function runAuthLogout(): void {
  const config = readConfig();

  if (!config) {
    console.log("Not logged in. Nothing to do.");
    return;
  }

  deleteConfig();
  console.log(`Logged out (${config.email}). Config removed.`);
}
