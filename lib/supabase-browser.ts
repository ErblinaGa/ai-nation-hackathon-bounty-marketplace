// Browser-safe Supabase exports — for "use client" components.
// Does NOT import next/headers, so safe to bundle client-side.
// Server-side code should use lib/supabase.ts directly.
import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getBrowserClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
