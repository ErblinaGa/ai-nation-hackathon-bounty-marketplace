"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RepoCard from "@/components/RepoCard";
import type { BountyListItem, RepoConnection } from "@/lib/types";

// API returns RepoConnection[] directly

function CliSnippet({ command, label }: { command: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent
    }
  }

  return (
    <div className="border border-border bg-fg/[0.02] flex items-center justify-between gap-2 px-4 py-3">
      <code className="font-mono text-sm text-fg flex-1 break-all">
        <span className="text-muted select-none">$ </span>
        {command}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="flex-shrink-0 text-[10px] font-mono border border-border px-3 py-1.5 text-muted hover:text-fg hover:border-fg/40 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label={copied ? "Copied!" : label}
      >
        {copied ? "COPIED" : "COPY"}
      </button>
    </div>
  );
}

export default function ReposPage() {
  const [repos, setRepos] = useState<RepoConnection[]>([]);
  const [bounties, setBounties] = useState<BountyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [howToOpen, setHowToOpen] = useState(false);

  async function fetchData() {
    try {
      const [reposRes, bountiesRes] = await Promise.all([
        fetch("/api/repos"),
        fetch("/api/bounties"),
      ]);
      if (!reposRes.ok) throw new Error(`Repos API: HTTP ${reposRes.status}`);
      // API returns RepoConnection[] directly
      const reposData = (await reposRes.json()) as RepoConnection[];
      setRepos(Array.isArray(reposData) ? reposData : []);

      if (bountiesRes.ok) {
        const bountiesData = (await bountiesRes.json()) as {
          bounties: BountyListItem[];
        };
        setBounties(bountiesData.bounties ?? []);
      }

      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load repositories."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 5_000);
    return () => clearInterval(id);
  }, []);

  // Count bounties per repo
  function bountyCountForRepo(owner: string, repo: string): number {
    const slug = `${owner}/${repo}`;
    return bounties.filter((b) => b.github_repo === slug).length;
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

      <div className="max-w-[1280px] mx-auto px-8 py-16">
        {/* Header */}
        <div className="grid grid-cols-12 gap-8 items-end mb-12">
          <div className="col-span-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-6 h-px bg-accent" />
              <span className="text-xs font-mono text-muted tracking-widest uppercase">
                GitHub Integration
              </span>
            </div>
            <h1 className="font-display font-bold text-5xl tracking-tightest text-fg mb-3">
              Connected Repos
            </h1>
            {!loading && !error && (
              <p className="text-sm text-muted font-mono">
                <span className="text-fg font-semibold">{repos.length}</span>{" "}
                {repos.length === 1 ? "repository" : "repositories"} connected
              </p>
            )}
          </div>

          <div className="col-span-5 flex justify-end">
            {repos.length > 0 && (
              <div className="text-right">
                <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-2">
                  Add more
                </div>
                <div className="text-xs font-mono border border-border px-4 py-2 text-muted bg-fg/[0.02]">
                  <span className="text-muted/50 select-none">$ </span>
                  <span className="text-fg">lb gh connect &lt;owner/repo&gt;</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="border border-border p-6 h-44 bg-fg/[0.02] animate-pulse"
                aria-hidden="true"
              >
                <div className="h-4 bg-fg/8 w-40 mb-3" />
                <div className="h-3 bg-fg/8 w-full mb-2" />
                <div className="h-3 bg-fg/8 w-2/3" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div
            className="border border-danger/30 bg-danger/5 px-6 py-5 text-sm text-danger font-mono"
            role="alert"
          >
            {error}
            <button
              onClick={() => {
                setLoading(true);
                fetchData();
              }}
              className="ml-4 underline hover:no-underline"
              aria-label="Retry"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && repos.length === 0 && (
          <div className="border border-border">
            {/* Structural decoration */}
            <div className="grid grid-cols-12 gap-0 border-b border-border">
              <div className="col-span-1 border-r border-border py-16 flex items-center justify-center">
                <span
                  className="font-display font-bold text-4xl tracking-tightest text-fg/8 select-none"
                  aria-hidden="true"
                >
                  gh
                </span>
              </div>
              <div className="col-span-11 px-8 py-16">
                <div className="max-w-md">
                  <h2 className="font-display font-bold text-2xl tracking-tight text-fg mb-3">
                    No repos connected yet
                  </h2>
                  <p className="text-sm text-muted leading-relaxed mb-6">
                    Connect a GitHub repo to post issues as bounties and enable
                    the autonomous auditor flow. Buyers never see bidder code —
                    only the winner&apos;s PR.
                  </p>

                  <div className="mb-2">
                    <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-2">
                      Connect a repository
                    </div>
                    <CliSnippet
                      command="lb gh connect <owner>/<repo>"
                      label="Copy connect command"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* How to connect — expandable */}
            <div>
              <button
                type="button"
                onClick={() => setHowToOpen((v) => !v)}
                className="w-full flex items-center gap-3 px-8 py-4 text-xs font-mono text-muted hover:text-fg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-expanded={howToOpen}
                aria-controls="how-to-connect"
              >
                <span
                  className={`w-3.5 h-3.5 border border-current flex items-center justify-center transition-transform ${
                    howToOpen ? "rotate-45" : ""
                  }`}
                  aria-hidden="true"
                >
                  <span className="text-[9px] leading-none">+</span>
                </span>
                <span className="tracking-widest uppercase">
                  {howToOpen ? "Hide Instructions" : "How to Connect a Repo"}
                </span>
              </button>

              {howToOpen && (
                <div
                  id="how-to-connect"
                  className="border-t border-border px-8 py-8"
                >
                  <div className="grid grid-cols-3 gap-8 max-w-3xl">
                    {[
                      {
                        step: "01",
                        title: "Install the CLI",
                        cmd: "npm i -g lightning-bounties-cli",
                        desc: "One-time install. Requires Node 18+.",
                      },
                      {
                        step: "02",
                        title: "Authenticate GitHub",
                        cmd: "lb gh login",
                        desc: "Opens browser for GitHub OAuth. One-time per machine.",
                      },
                      {
                        step: "03",
                        title: "Connect your repo",
                        cmd: "lb gh connect owner/repo",
                        desc: "Registers the repo with the marketplace. Shows here instantly.",
                      },
                    ].map((item) => (
                      <div key={item.step}>
                        <div
                          className="font-display font-bold text-5xl tracking-tightest text-fg/8 mb-4 select-none"
                          aria-hidden="true"
                        >
                          {item.step}
                        </div>
                        <h3 className="font-display font-bold text-sm tracking-tight text-fg mb-2">
                          {item.title}
                        </h3>
                        <div className="border border-border bg-fg/[0.02] px-3 py-2 mb-2">
                          <code className="font-mono text-xs text-fg break-all">
                            {item.cmd}
                          </code>
                        </div>
                        <p className="text-xs text-muted leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Repo grid */}
        {!loading && !error && repos.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {repos.map((repo) => (
              <RepoCard
                key={repo.id}
                repo={repo}
                bountyCount={bountyCountForRepo(repo.owner, repo.repo)}
              />
            ))}
          </div>
        )}

        {/* How to connect — expandable (even when repos exist) */}
        {!loading && !error && repos.length > 0 && (
          <div className="mt-12 border border-border">
            <button
              type="button"
              onClick={() => setHowToOpen((v) => !v)}
              className="w-full flex items-center gap-3 px-6 py-4 text-xs font-mono text-muted hover:text-fg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-expanded={howToOpen}
              aria-controls="how-to-connect-bottom"
            >
              <span
                className={`w-3.5 h-3.5 border border-current flex items-center justify-center transition-transform ${
                  howToOpen ? "rotate-45" : ""
                }`}
                aria-hidden="true"
              >
                <span className="text-[9px] leading-none">+</span>
              </span>
              <span className="tracking-widest uppercase">
                How to Connect a New Repo
              </span>
            </button>

            {howToOpen && (
              <div
                id="how-to-connect-bottom"
                className="border-t border-border px-6 py-6"
              >
                <div className="grid grid-cols-3 gap-6 max-w-2xl">
                  {[
                    { label: "Install CLI", cmd: "npm i -g lightning-bounties-cli" },
                    { label: "Authenticate", cmd: "lb gh login" },
                    { label: "Connect repo", cmd: "lb gh connect owner/repo" },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-2">
                        {item.label}
                      </div>
                      <CliSnippet command={item.cmd} label={`Copy: ${item.cmd}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
