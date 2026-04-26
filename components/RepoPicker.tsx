"use client";

import { useEffect, useState, useId } from "react";
import Link from "next/link";
import type { GitHubRepo } from "@/app/api/github/repos/route";

interface RepoPickerProps {
  value: string; // "owner/repo" or ""
  onChange: (value: string) => void;
  optional?: boolean;
  label?: string;
}

type LoadState = "idle" | "loading" | "loaded" | "error" | "no-token";

export default function RepoPicker({
  value,
  onChange,
  optional = false,
  label = "Repository",
}: RepoPickerProps) {
  const selectId = useId();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");

    fetch("/api/github/repos")
      .then(async (res) => {
        const data = await res.json() as GitHubRepo[] | { error: string; reconnect?: boolean };
        if (cancelled) return;

        if (!res.ok) {
          const errData = data as { error: string; reconnect?: boolean };
          if (errData.reconnect) {
            setLoadState("no-token");
          } else {
            setLoadState("error");
            setErrorMsg(errData.error ?? "Failed to load repos");
          }
          return;
        }

        setRepos(data as GitHubRepo[]);
        setLoadState("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadState("error");
        setErrorMsg(err instanceof Error ? err.message : "Network error");
      });

    return () => { cancelled = true; };
  }, []);

  if (loadState === "loading") {
    return (
      <div>
        <div className="text-xs font-mono text-muted tracking-widest uppercase mb-2">
          {label}
          {optional && <span className="normal-case tracking-normal text-muted/60 ml-1">(optional)</span>}
        </div>
        <div className="w-full border border-border bg-bg px-4 py-3 text-xs font-mono text-muted/50 animate-pulse">
          Loading repositories…
        </div>
      </div>
    );
  }

  if (loadState === "no-token") {
    return (
      <div>
        <div className="text-xs font-mono text-muted tracking-widest uppercase mb-2">
          {label}
        </div>
        <div className="border border-amber/30 bg-amber/[0.04] px-4 py-3 text-xs font-mono text-amber flex items-center justify-between gap-4">
          <span>GitHub not connected</span>
          <Link
            href="/repos/connect"
            className="border border-amber/40 px-3 py-1.5 text-[10px] tracking-widest uppercase hover:bg-amber/10 transition-colors"
            aria-label="Connect GitHub account"
          >
            Connect
          </Link>
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div>
        <div className="text-xs font-mono text-muted tracking-widest uppercase mb-2">
          {label}
        </div>
        <div className="border border-danger/30 bg-danger/[0.04] px-4 py-3 text-xs font-mono text-danger">
          {errorMsg}
        </div>
      </div>
    );
  }

  if (loadState === "loaded" && repos.length === 0) {
    return (
      <div>
        <div className="text-xs font-mono text-muted tracking-widest uppercase mb-2">
          {label}
          {optional && <span className="normal-case tracking-normal text-muted/60 ml-1">(optional)</span>}
        </div>
        <div className="border border-border bg-bg px-4 py-3 flex items-center justify-between gap-4">
          <span className="text-xs font-mono text-muted">No repositories found</span>
          <Link
            href="/repos/connect"
            className="text-[10px] font-mono border border-border px-3 py-1.5 tracking-widest uppercase text-muted hover:text-fg hover:border-fg/40 transition-colors"
            aria-label="Connect a GitHub repository"
          >
            + Connect repo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={selectId}
        className="block text-xs font-mono text-muted tracking-widest uppercase mb-2"
      >
        {label}
        {optional && <span className="normal-case tracking-normal text-muted/60 ml-1">(optional)</span>}
      </label>

      <div className="relative">
        <select
          id={selectId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none border border-border bg-bg px-4 py-3 font-mono text-xs text-fg focus:outline-none focus:border-fg/40 transition-colors pr-10 cursor-pointer"
          aria-label={`Select ${label}`}
        >
          <option value="">— select a repo —</option>
          {repos.map((r) => (
            <option key={r.id} value={r.full_name}>
              {r.full_name}
              {r.private ? " (private)" : ""}
            </option>
          ))}
        </select>
        {/* Custom chevron */}
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
          </svg>
        </div>
      </div>

      <div className="mt-1.5 flex justify-end">
        <Link
          href="/repos/connect"
          className="text-[10px] font-mono text-muted/60 hover:text-muted transition-colors tracking-wide"
          aria-label="Connect more repositories"
        >
          + connect more repos
        </Link>
      </div>
    </div>
  );
}
