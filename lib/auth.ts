// Minimal auth: reads x-pubkey header. No real signature verification for demo.
// In production this would verify a LNURL-auth signature against the pubkey.
import type { NextRequest } from "next/server";

export function getPubkeyFromRequest(req: NextRequest): string | null {
  return req.headers.get("x-pubkey") ?? null;
}

export function requirePubkey(req: NextRequest): string {
  const pubkey = getPubkeyFromRequest(req);
  if (!pubkey || pubkey.trim() === "") {
    throw new Error("Missing x-pubkey header");
  }
  return pubkey.trim();
}
