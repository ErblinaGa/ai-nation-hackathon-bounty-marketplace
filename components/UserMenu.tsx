"use client";

// UserMenu — top-right nav element.
// Shows email/display_name when logged in, "Sign in" link otherwise.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

function getBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only check auth when Supabase is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setLoading(false);
      return;
    }

    const supabase = getBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // Listen for auth state changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    try {
      const supabase = getBrowserClient();
      await supabase.auth.signOut();
      router.push("/login");
    } catch (err) {
      console.error("[UserMenu][signOut] error:", err);
    }
  }

  if (loading) {
    return <div style={{ width: 80, height: 28 }} />;
  }

  if (!user) {
    return (
      <Link
        href="/login"
        style={{
          display: "inline-block",
          padding: "5px 12px",
          border: "1px solid var(--border)",
          fontFamily: "var(--font-jetbrains), monospace",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--fg)",
          textDecoration: "none",
        }}
      >
        Sign in
      </Link>
    );
  }

  const label =
    user.user_metadata?.display_name ??
    user.user_metadata?.github_username ??
    user.email ??
    "Account";

  // Truncate long emails for display
  const displayLabel =
    typeof label === "string" && label.length > 24
      ? label.slice(0, 22) + "…"
      : label;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Link
        href="/dashboard"
        style={{
          fontFamily: "var(--font-jetbrains), monospace",
          fontSize: 11,
          color: "var(--fg)",
          textDecoration: "none",
          maxWidth: 200,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={typeof label === "string" ? label : undefined}
      >
        {displayLabel}
      </Link>
      <button
        type="button"
        onClick={signOut}
        style={{
          background: "transparent",
          border: "1px solid var(--border)",
          fontFamily: "var(--font-jetbrains), monospace",
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--muted)",
          padding: "4px 8px",
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </div>
  );
}
