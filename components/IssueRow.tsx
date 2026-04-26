"use client";

import { useState } from "react";

export interface GitHubIssue {
  number: number;
  title: string;
  html_url: string;
  labels: Array<{ name: string; color: string }>;
  state: "open" | "closed";
  created_at: string;
  body: string | null;
}

interface IssueRowProps {
  issue: GitHubIssue;
  repoSlug: string; // "owner/repo"
}

// CLI copy modal — shows `lb gh-bounty owner/repo#N` command
function CliModal({
  repoSlug,
  issueNumber,
  onClose,
}: {
  repoSlug: string;
  issueNumber: number;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const cmd = `lb gh-bounty ${repoSlug}#${issueNumber}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback — select text
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Post issue as bounty"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-fg/20"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative bg-bg border border-border w-full max-w-md mx-4 p-6">
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-muted hover:text-fg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label="Close modal"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
          </svg>
        </button>

        <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-4">
          Post as Bounty
        </div>

        <h3 className="font-display font-bold text-lg tracking-tight text-fg mb-2">
          Run in your terminal
        </h3>
        <p className="text-sm text-muted font-mono mb-5 leading-relaxed">
          The CLI fetches issue context, prompts for bounty settings, and posts to the marketplace.
        </p>

        {/* Command block */}
        <div className="border border-border bg-fg/[0.02] flex items-center justify-between gap-2 px-4 py-3 mb-2">
          <code className="font-mono text-sm text-fg flex-1 break-all">
            <span className="text-muted select-none">$ </span>
            {cmd}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="flex-shrink-0 text-[10px] font-mono border border-border px-3 py-1.5 text-muted hover:text-fg hover:border-fg/40 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={copied ? "Copied!" : "Copy command to clipboard"}
          >
            {copied ? "COPIED" : "COPY"}
          </button>
        </div>

        <p className="text-[10px] font-mono text-muted/60">
          Requires the Lightning Bounties CLI · <code>npm i -g lightning-bounties-cli</code>
        </p>
      </div>
    </div>
  );
}

export default function IssueRow({ issue, repoSlug }: IssueRowProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div
        className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-b-0 hover:bg-fg/[0.02] transition-colors"
        role="listitem"
      >
        {/* Issue number */}
        <div className="w-12 flex-shrink-0">
          <span className="font-mono text-xs text-muted">#{issue.number}</span>
        </div>

        {/* Title + labels */}
        <div className="flex-1 min-w-0">
          <a
            href={issue.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-display font-semibold text-sm text-fg hover:text-accent transition-colors line-clamp-1 tracking-tight"
            aria-label={`View issue #${issue.number}: ${issue.title} on GitHub`}
          >
            {issue.title}
          </a>
          {issue.labels.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {issue.labels.slice(0, 4).map((label) => (
                <span
                  key={label.name}
                  className="text-[9px] font-mono tracking-widest px-1.5 py-0.5 border border-border text-muted"
                  aria-label={`Label: ${label.name}`}
                >
                  {label.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Post as bounty button */}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex-shrink-0 text-[10px] font-mono border border-accent/40 text-accent px-3 py-1.5 tracking-widest hover:bg-accent hover:text-fg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={`Post issue #${issue.number} as a bounty`}
        >
          POST AS BOUNTY
        </button>
      </div>

      {modalOpen && (
        <CliModal
          repoSlug={repoSlug}
          issueNumber={issue.number}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
