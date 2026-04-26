"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSession } from "@/lib/auth/session";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const session = getSession();
    const isPublic = pathname.startsWith("/login");

    if (!session && !isPublic) {
      router.replace(`/login?from=${encodeURIComponent(pathname)}`);
    } else {
      setChecked(true);
    }
  }, [pathname, router]);

  if (!checked && !pathname.startsWith("/login")) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="font-mono text-sm text-[--text-muted]">Loading…</span>
      </div>
    );
  }

  return <>{children}</>;
}
