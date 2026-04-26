"use client";

// AuthGuard — wraps protected client components.
// Redirects to /login if no Supabase session.
// For server-side protection, use getCurrentUser() in the server component directly.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

function getBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

interface Props {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: Props) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    // Only enforce when Supabase is active
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const supabase = getBrowserClient();

      supabase.auth.getSession().then(({ data }) => {
        if (!data.session) {
          router.replace("/login");
        } else {
          setAuthed(true);
        }
        setChecking(false);
      }).catch(() => {
        router.replace("/login");
        setChecking(false);
      });
    } else {
      // SQLite mode — no auth enforced
      setAuthed(true);
      setChecking(false);
    }
  }, [router]);

  if (checking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-jetbrains), monospace",
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          Checking session...
        </span>
      </div>
    );
  }

  if (!authed) return null;

  return <>{children}</>;
}
