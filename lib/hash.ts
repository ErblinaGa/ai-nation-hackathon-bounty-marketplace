// SHA-256 utility using Node's built-in crypto — no external deps needed.
import { createHash } from "crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function randomHex(bytes = 32): string {
  return createHash("sha256")
    .update(Math.random().toString() + Date.now().toString())
    .digest("hex")
    .slice(0, bytes * 2);
}
