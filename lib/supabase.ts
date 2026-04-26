// Supabase client factories for client/server/admin.
// Used by:
//  - Frontend (anon key): browser auth, RLS-respecting reads
//  - Server-side (anon key + cookies): SSR with user session
//  - Admin (secret key): server jobs that need to bypass RLS (auditor, autoPR, ledger)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// Browser client — for "use client" components. Reads/writes via RLS.
export function getBrowserClient(): SupabaseClient {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Server client — Next.js server components + API routes. Honors cookies for session.
export async function getServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // noop in RSC
        }
      },
    },
  });
}

// Admin client — uses secret key, bypasses RLS. ONLY use server-side for system jobs.
let _admin: SupabaseClient | null = null;
export function getAdminClient(): SupabaseClient {
  if (!SUPABASE_SECRET_KEY) {
    throw new Error("[supabase] SUPABASE_SECRET_KEY required for admin client");
  }
  if (!_admin) {
    _admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}
