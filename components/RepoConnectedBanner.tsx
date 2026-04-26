"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { RepoConnection } from "@/lib/types";

// GitHub icon — simple SVG mark
function GitHubMark({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function ChevronDown({ size = 10 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 3.5l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
    </svg>
  );
}

export default function RepoConnectedBanner() {
  const [repos, setRepos] = useState<RepoConnection[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  async function fetchRepos() {
    try {
      const res = await fetch("/api/repos");
      if (!res.ok) return;
      // API returns RepoConnection[] directly
      const data = (await res.json()) as RepoConnection[] | { error: string };
      if (Array.isArray(data)) setRepos(data);
    } catch {
      // Silent — banner is optional decoration
    }
  }

  useEffect(() => {
    fetchRepos();
    const id = setInterval(fetchRepos, 30_000);
    return () => clearInterval(id);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Don't render at all if no repos
  if (repos.length === 0) return null;

  const primary = repos[0];
  const hasMultiple = repos.length > 1;

  return (
    <div
      className="border-b border-border bg-fg/[0.018]"
      role="banner"
      aria-label="Connected GitHub repositories"
    >
      <div className="max-w-[1280px] mx-auto px-8 h-9 flex items-center justify-between gap-4">
        {/* Left — accent dot + connected label */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Accent dot — structural marker */}
          <span
            className="w-1.5 h-1.5 bg-accent flex-shrink-0"
            aria-hidden="true"
          />
          <span className="text-[10px] font-mono text-muted tracking-widest uppercase flex-shrink-0">
            GitHub
          </span>
          <span className="text-border flex-shrink-0">·</span>

          {/* Primary repo link — or dropdown trigger */}
          {!hasMultiple ? (
            <Link
              href={`/repos/${primary.owner}/${primary.repo}`}
              className="flex items-center gap-2 group hover:opacity-80 transition-opacity min-w-0"
              aria-label={`View connected repo: ${primary.owner}/${primary.repo}`}
            >
              <GitHubMark size={13} />
              <span className="font-mono text-xs text-fg tracking-tight truncate">
                {primary.owner}/{primary.repo}
              </span>
            </Link>
          ) : (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-expanded={dropdownOpen}
                aria-haspopup="listbox"
                aria-label="Select connected repo"
              >
                <GitHubMark size={13} />
                <span className="font-mono text-xs text-fg tracking-tight">
                  {primary.owner}/{primary.repo}
                </span>
                <span className="text-muted ml-0.5">
                  +{repos.length - 1}
                </span>
                <ChevronDown />
              </button>

              {dropdownOpen && (
                <div
                  className="absolute top-full left-0 mt-1 border border-border bg-bg z-50 min-w-[200px]"
                  role="listbox"
                  aria-label="Connected repos"
                >
                  {repos.map((r) => (
                    <Link
                      key={r.id}
                      href={`/repos/${r.owner}/${r.repo}`}
                      role="option"
                      aria-selected={r.id === primary.id}
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-fg/[0.04] transition-colors border-b border-border last:border-b-0"
                      aria-label={`Go to ${r.owner}/${r.repo}`}
                    >
                      <GitHubMark size={12} />
                      <span className="font-mono text-xs text-fg truncate">
                        {r.owner}/{r.repo}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right — "Connect another" link */}
        <Link
          href="/repos"
          className="text-[10px] font-mono text-muted tracking-widest uppercase hover:text-fg transition-colors flex-shrink-0"
          aria-label="Connect another repository"
        >
          + Connect another
        </Link>
      </div>
    </div>
  );
}
