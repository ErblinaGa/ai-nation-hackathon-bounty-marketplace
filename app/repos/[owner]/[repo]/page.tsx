"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import BountyCard from "@/components/BountyCard";
import IssueRow from "@/components/IssueRow";
import type { BountyListItem, RepoConnection } from "@/lib/types";
import type { GitHubIssue } from "@/components/IssueRow";

interface RepoDetailData {
  connection: RepoConnection;
  recent_bounties: BountyListItem[];
}

interface IssuesData {
  issues: GitHubIssue[];
}

function GitHubMark({ size = 16 }: { size?: number }) {
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function RepoDetailPage() {
  const params = useParams<{ owner: string; repo: string }>();
  const { owner, repo } = params;

  const [repoData, setRepoData] = useState<RepoConnection | null>(null);
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [bounties, setBounties] = useState<BountyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issuesError, setIssuesError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const repoRes = await fetch(`/api/repos/${owner}/${repo}`);

      if (!repoRes.ok) {
        throw new Error(
          repoRes.status === 404
            ? "Repository not found. Make sure it's connected via the CLI."
            : `HTTP ${repoRes.status}`
        );
      }

      // API returns { connection, recent_bounties }
      const data = (await repoRes.json()) as RepoDetailData;
      setRepoData(data.connection);
      setBounties(data.recent_bounties ?? []);

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repo.");
    } finally {
      setLoading(false);
    }
  }, [owner, repo]);

  const fetchIssues = useCallback(async () => {
    try {
      const res = await fetch(`/api/repos/${owner}/${repo}/issues`);
      if (!res.ok) {
        if (res.status === 404 || res.status === 501) {
          setIssuesError("TODO");
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as IssuesData;
      setIssues(data.issues ?? []);
      setIssuesError(null);
    } catch {
      setIssuesError("failed");
    }
  }, [owner, repo]);

  useEffect(() => {
    fetchData();
    fetchIssues();
    const id = setInterval(() => {
      fetchData();
      fetchIssues();
    }, 5_000);
    return () => clearInterval(id);
  }, [fetchData, fetchIssues]);

  const repoSlug = `${owner}/${repo}`;

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <nav className="border-b border-border">
          <div className="max-w-[1280px] mx-auto px-8 h-14 flex items-center">
            <Link
              href="/"
              className="font-display font-bold text-sm tracking-tight text-fg hover:text-accent transition-colors"
              aria-label="Home"
            >
              LIGHTNING BOUNTIES
            </Link>
          </div>
        </nav>
        <div className="max-w-[1280px] mx-auto px-8 py-16">
          <div className="animate-pulse space-y-6">
            <div className="h-4 bg-fg/8 w-24" />
            <div className="h-10 bg-fg/8 w-2/3" />
            <div className="h-4 bg-fg/8 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // Error
  if (error || !repoData) {
    return (
      <div className="min-h-screen bg-bg">
        <nav className="border-b border-border">
          <div className="max-w-[1280px] mx-auto px-8 h-14 flex items-center justify-between">
            <Link
              href="/"
              className="font-display font-bold text-sm tracking-tight text-fg hover:text-accent transition-colors"
              aria-label="Home"
            >
              LIGHTNING BOUNTIES
            </Link>
          </div>
        </nav>
        <div className="max-w-[1280px] mx-auto px-8 py-16">
          <div
            className="border border-danger/30 bg-danger/5 px-6 py-5 text-sm text-danger font-mono inline-block"
            role="alert"
          >
            {error ?? "Repository not found."}
          </div>
          <div className="mt-4">
            <Link
              href="/repos"
              className="text-xs font-mono text-muted hover:text-fg transition-colors underline"
              aria-label="Back to repos"
            >
              ← Back to repos
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <nav className="border-b border-border">
        <div className="max-w-[1280px] mx-auto px-8 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="font-display font-bold text-sm tracking-tight text-fg hover:text-accent transition-colors"
            aria-label="Lightning Bounties home"
          >
            LIGHTNING BOUNTIES
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/bounties"
              className="text-xs font-mono text-muted hover:text-fg transition-colors"
              aria-label="Browse active bounties"
            >
              Browse
            </Link>
            <Link
              href="/post"
              className="text-xs font-mono px-4 py-2 border border-fg text-fg hover:bg-fg hover:text-bg transition-colors"
              aria-label="Post a bounty"
            >
              Post Bounty
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-[1280px] mx-auto px-8 py-12">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-10 text-xs font-mono text-muted">
          <Link href="/repos" className="hover:text-fg transition-colors" aria-label="Back to repos">
            Repos
          </Link>
          <span>/</span>
          <span className="text-fg">{repoSlug}</span>
        </div>

        {/* Header — asymmetric */}
        <div className="grid grid-cols-12 gap-8 mb-16">
          <div className="col-span-8">
            <div className="flex items-center gap-3 mb-4">
              <GitHubMark size={20} />
              <h1 className="font-display font-bold text-[44px] leading-[0.95] tracking-tightest text-fg">
                {owner}/<span className="text-accent">{repo}</span>
              </h1>
            </div>

            {repoData.description && (
              <p className="text-base text-muted leading-relaxed max-w-xl mb-3">
                {repoData.description}
              </p>
            )}

            <div className="flex items-center gap-5 text-xs font-mono text-muted mt-4">
              {repoData.github_username && (
                <span>
                  Connected by{" "}
                  <span className="text-fg">@{repoData.github_username}</span>
                </span>
              )}
              <span className="text-border">·</span>
              <span>
                Since{" "}
                <span className="text-fg">{formatDate(repoData.connected_at)}</span>
              </span>
              {repoData.default_branch && (
                <>
                  <span className="text-border">·</span>
                  <span className="font-mono text-[10px] border border-border px-2 py-0.5">
                    {repoData.default_branch}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right — quick stats */}
          <div className="col-span-4">
            <div className="border border-border p-5 sticky top-8">
              <div className="grid grid-cols-2 gap-px bg-border border border-border">
                <div className="bg-bg px-4 py-4">
                  <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1.5">
                    Issues
                  </div>
                  <div className="font-mono font-bold text-2xl text-fg tabular-nums">
                    {issuesError === "TODO" ? "—" : issues.length}
                  </div>
                </div>
                <div className="bg-bg px-4 py-4">
                  <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1.5">
                    Bounties
                  </div>
                  <div className="font-mono font-bold text-2xl text-accent tabular-nums">
                    {bounties.length}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <a
                  href={`https://github.com/${repoSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs font-mono text-muted hover:text-fg transition-colors"
                  aria-label={`View ${repoSlug} on GitHub`}
                >
                  <GitHubMark size={12} />
                  View on GitHub
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ── Open Issues section ── */}
        <section aria-label="Open GitHub issues" className="mb-16">
          <div className="flex items-center gap-4 mb-6">
            <div className="text-xs font-mono text-muted tracking-widest uppercase">
              Open Issues
            </div>
            <div className="flex-1 h-px bg-border" />
            {issues.length > 0 && (
              <span className="text-xs font-mono text-muted">
                {issues.length} open
              </span>
            )}
          </div>

          {issuesError === "TODO" && (
            <div className="border border-border py-12 px-8">
              <div
                className="font-display font-bold text-3xl tracking-tightest text-fg/10 mb-4 select-none"
                aria-hidden="true"
              >
                —
              </div>
              <p className="text-sm text-muted font-mono mb-2">
                Issues from this repo will appear here.
              </p>
              <p className="text-xs text-muted/60 font-mono">
                TODO: Team B&apos;s <code>/api/repos/{repoSlug}/issues</code> endpoint is not yet available.
              </p>
            </div>
          )}

          {issuesError && issuesError !== "TODO" && (
            <div
              className="border border-danger/30 bg-danger/5 px-6 py-4 text-sm text-danger font-mono"
              role="alert"
            >
              Failed to load issues.
            </div>
          )}

          {!issuesError && issues.length === 0 && (
            <div className="border border-border py-12 text-center">
              <p className="text-sm text-muted font-mono">No open issues.</p>
            </div>
          )}

          {!issuesError && issues.length > 0 && (
            <div className="border border-border" role="list" aria-label="Open issues">
              {/* Header row */}
              <div className="flex items-center gap-4 px-4 py-2 bg-fg/[0.02] border-b border-border">
                <div className="w-12 flex-shrink-0 text-[10px] font-mono text-muted tracking-widest uppercase">
                  #
                </div>
                <div className="flex-1 text-[10px] font-mono text-muted tracking-widest uppercase">
                  Title
                </div>
                <div className="w-32 flex-shrink-0" />
              </div>
              {issues.map((issue) => (
                <IssueRow key={issue.number} issue={issue} repoSlug={repoSlug} />
              ))}
            </div>
          )}
        </section>

        {/* ── Recent Bounties from this repo ── */}
        <section aria-label="Bounties from this repo">
          <div className="flex items-center gap-4 mb-6">
            <div className="text-xs font-mono text-muted tracking-widest uppercase">
              Bounties from this repo
            </div>
            <div className="flex-1 h-px bg-border" />
            {bounties.length > 0 && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-amber" aria-hidden="true" />
                <span className="text-xs font-mono text-muted">live</span>
              </>
            )}
          </div>

          {bounties.length === 0 ? (
            <div className="border border-border py-12 px-8 flex items-start gap-8">
              <div
                className="font-display font-bold text-5xl tracking-tightest text-fg/8 select-none flex-shrink-0"
                aria-hidden="true"
              >
                0
              </div>
              <div>
                <p className="text-sm text-muted mb-3">
                  No bounties posted from this repo yet.
                </p>
                <p className="text-xs text-muted/60 font-mono">
                  Run{" "}
                  <code className="text-fg">lb gh-bounty {repoSlug}#&lt;issue&gt;</code>{" "}
                  to post one.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {bounties.map((bounty) => (
                <BountyCard key={bounty.id} bounty={bounty} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
