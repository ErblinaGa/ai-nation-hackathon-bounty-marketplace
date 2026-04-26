"use client";

import { useEffect, useState, useId, useRef } from "react";
import type { GitHubIssue } from "@/app/api/github/issues/route";

interface IssuePickerProps {
  repo: string; // "owner/repo" — if empty, shows placeholder
  value: number | null; // selected issue number
  onChange: (issue: GitHubIssue | null) => void;
}

type LoadState = "idle" | "loading" | "loaded" | "error";

function IssueLabel({ name, color }: { name: string; color: string }) {
  // Compute text color based on label background brightness
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const textColor = luminance > 0.5 ? "#000000" : "#ffffff";

  return (
    <span
      style={{ backgroundColor: `#${color}`, color: textColor }}
      className="px-1.5 py-0.5 text-[9px] font-mono tracking-wide leading-none"
    >
      {name}
    </span>
  );
}

export default function IssuePicker({ repo, value, onChange }: IssuePickerProps) {
  const selectId = useId();
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!repo) {
      setIssues([]);
      setLoadState("idle");
      return;
    }

    // Cancel previous request
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoadState("loading");
    setIssues([]);

    fetch(`/api/github/issues?repo=${encodeURIComponent(repo)}`, { signal: ctrl.signal })
      .then(async (res) => {
        const data = await res.json() as GitHubIssue[] | { error: string };
        if (!res.ok) {
          setLoadState("error");
          setErrorMsg((data as { error: string }).error ?? "Failed to load issues");
          return;
        }
        setIssues(data as GitHubIssue[]);
        setLoadState("loaded");
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setLoadState("error");
        setErrorMsg(err instanceof Error ? err.message : "Network error");
      });

    return () => ctrl.abort();
  }, [repo]);

  if (!repo) {
    return (
      <div>
        <div className="text-xs font-mono text-muted tracking-widest uppercase mb-2">Issue</div>
        <div className="w-full border border-border bg-bg px-4 py-3 text-xs font-mono text-muted/40">
          Select a repository first
        </div>
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div>
        <div className="text-xs font-mono text-muted tracking-widest uppercase mb-2">Issue</div>
        <div className="space-y-1.5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="border border-border px-4 py-3 h-10 bg-fg/[0.02] animate-pulse"
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div>
        <div className="text-xs font-mono text-muted tracking-widest uppercase mb-2">Issue</div>
        <div className="border border-danger/30 bg-danger/[0.04] px-4 py-3 text-xs font-mono text-danger" role="alert">
          {errorMsg}
        </div>
      </div>
    );
  }

  if (loadState === "loaded" && issues.length === 0) {
    return (
      <div>
        <div className="text-xs font-mono text-muted tracking-widest uppercase mb-2">Issue</div>
        <div className="border border-border px-4 py-3 text-xs font-mono text-muted/60">
          No open issues in {repo}
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
        Issue
      </label>

      {/* Custom dropdown — shows issue number + title + labels */}
      <div className="relative">
        <select
          id={selectId}
          value={value ?? ""}
          onChange={(e) => {
            const num = parseInt(e.target.value, 10);
            const found = issues.find((i) => i.number === num) ?? null;
            onChange(found);
          }}
          className="w-full appearance-none border border-border bg-bg px-4 py-3 font-mono text-xs text-fg focus:outline-none focus:border-fg/40 transition-colors pr-10 cursor-pointer"
          aria-label="Select GitHub issue"
        >
          <option value="">— select an issue —</option>
          {issues.map((issue) => (
            <option key={issue.number} value={issue.number}>
              #{issue.number} — {issue.title}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
          </svg>
        </div>
      </div>

      {/* Selected issue preview with labels */}
      {value !== null && (() => {
        const selected = issues.find((i) => i.number === value);
        if (!selected) return null;
        return (
          <div className="mt-2 border border-border/60 bg-fg/[0.02] px-4 py-3">
            <div className="flex items-start justify-between gap-3 mb-1">
              <span className="font-mono text-xs text-muted flex-shrink-0">
                #{selected.number}
              </span>
              <a
                href={selected.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-mono text-muted/60 hover:text-muted transition-colors flex-shrink-0"
                aria-label={`Open issue #${selected.number} on GitHub`}
              >
                view ↗
              </a>
            </div>
            <div className="text-xs text-fg font-sans mb-2 leading-snug">
              {selected.title}
            </div>
            {selected.labels.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selected.labels.map((label) => (
                  <IssueLabel key={label.name} name={label.name} color={label.color} />
                ))}
              </div>
            )}
            {selected.body && (
              <div className="mt-2 text-[11px] text-muted/70 leading-relaxed line-clamp-3 font-sans">
                {selected.body.slice(0, 200)}
                {selected.body.length > 200 ? "…" : ""}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
