"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguagePicker } from "@/components/LanguagePicker";
import { clearSession } from "@/lib/auth/session";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function Header() {
  const router = useRouter();

  function handleLogout() {
    clearSession();
    router.push("/login");
  }

  return (
    <header className="border-b border-[--border] bg-[--surface] px-6 h-14 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-6">
        <Link
          href="/"
          className="font-display font-bold text-base tracking-tight text-[--text] hover:text-[--accent] transition-colors"
          aria-label="Project Tracker home"
        >
          PT
        </Link>
        <nav className="hidden sm:flex items-center gap-1" aria-label="Main navigation">
          <Link
            href="/projects"
            className="px-3 py-1.5 text-sm text-[--text-muted] hover:text-[--text] border border-transparent hover:border-[--border] transition-colors"
          >
            Projects
          </Link>
          <Link
            href="/stats"
            className="px-3 py-1.5 text-sm text-[--text-muted] hover:text-[--text] border border-transparent hover:border-[--border] transition-colors"
          >
            Stats
          </Link>
          <Link
            href="/settings"
            className="px-3 py-1.5 text-sm text-[--text-muted] hover:text-[--text] border border-transparent hover:border-[--border] transition-colors"
          >
            Settings
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <LanguagePicker />
        <ThemeToggle />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          aria-label="Log out"
        >
          Log out
        </Button>
      </div>
    </header>
  );
}
