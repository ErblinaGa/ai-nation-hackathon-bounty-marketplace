"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BountyCard from "@/components/BountyCard";
import TaskTypeBadge from "@/components/TaskTypeBadge";
import type { BountyListItem, Language, TaskType } from "@/lib/types";

type LangFilter = "all" | Language;
type TypeFilter = "all" | TaskType;

export default function BountiesPage() {
  const [bounties, setBounties] = useState<BountyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [langFilter, setLangFilter] = useState<LangFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [minBounty, setMinBounty] = useState<string>("");

  async function fetchBounties() {
    try {
      const params = new URLSearchParams({ status: "OPEN" });
      if (langFilter !== "all") params.set("language", langFilter);
      if (minBounty && parseInt(minBounty, 10) > 0) {
        params.set("min_bounty", minBounty);
      }
      const res = await fetch(`/api/bounties?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { bounties: BountyListItem[] };
      setBounties(data.bounties);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bounties.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBounties();
    const id = setInterval(fetchBounties, 2000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langFilter, minBounty]);

  // Client-side task_type filter (API doesn't have this param yet)
  const filtered =
    typeFilter === "all" ? bounties : bounties.filter((b) => b.task_type === typeFilter);

  const totalSats = filtered.reduce((s, b) => s + b.max_bounty_sats, 0);

  const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
    { value: "all", label: "ALL" },
    { value: "snippet", label: "SNIPPET" },
    { value: "codebase", label: "CODEBASE" },
    { value: "bug_bounty", label: "BUG" },
  ];

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
          <Link
            href="/post"
            className="text-xs font-mono px-4 py-2 border border-fg text-fg hover:bg-fg hover:text-bg transition-colors"
            aria-label="Post a bounty"
          >
            Post Bounty
          </Link>
        </div>
      </nav>

      <div className="max-w-[1280px] mx-auto px-8 py-16">
        {/* Header */}
        <div className="grid grid-cols-12 gap-8 items-end mb-12">
          <div className="col-span-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-6 h-px bg-accent" />
              <span className="text-xs font-mono text-muted tracking-widest uppercase">
                Active Bounties
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-amber" aria-hidden="true" />
              <span className="text-xs font-mono text-muted">live</span>
            </div>
            <h1 className="font-display font-bold text-5xl tracking-tightest text-fg mb-3">
              Open Bounties
            </h1>
            {!loading && !error && (
              <p className="text-sm text-muted font-mono">
                <span className="text-fg font-semibold">{filtered.length}</span> active
                {totalSats > 0 && (
                  <>
                    {" · "}
                    <span className="text-accent font-semibold">
                      {totalSats.toLocaleString()}
                    </span>{" "}
                    sats at stake
                  </>
                )}
              </p>
            )}
          </div>

          {/* Filters */}
          <div className="col-span-6 flex items-end justify-end gap-3 flex-wrap">
            {/* Task type filter */}
            <fieldset>
              <legend className="sr-only">Filter by task type</legend>
              <div className="flex border border-border">
                {TYPE_FILTERS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTypeFilter(value)}
                    className={`px-3 py-2 text-xs font-mono tracking-wider border-r border-border last:border-r-0 transition-colors ${
                      typeFilter === value
                        ? "bg-fg text-bg"
                        : "bg-bg text-muted hover:text-fg"
                    }`}
                    aria-label={`Filter by type: ${label}`}
                    aria-pressed={typeFilter === value}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Language filter */}
            <fieldset>
              <legend className="sr-only">Filter by language</legend>
              <div className="flex border border-border">
                {(["all", "typescript", "python"] as LangFilter[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLangFilter(lang)}
                    className={`px-3 py-2 text-xs font-mono tracking-wider border-r border-border last:border-r-0 transition-colors ${
                      langFilter === lang
                        ? "bg-fg text-bg"
                        : "bg-bg text-muted hover:text-fg"
                    }`}
                    aria-label={`Filter: ${lang}`}
                    aria-pressed={langFilter === lang}
                  >
                    {lang === "all" ? "ALL" : lang === "typescript" ? "TS" : "PY"}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Min bounty filter */}
            <div className="flex items-center border border-border">
              <label
                htmlFor="min-bounty"
                className="px-3 py-2 text-xs font-mono text-muted border-r border-border bg-fg/[0.02] whitespace-nowrap"
              >
                MIN SATS
              </label>
              <input
                id="min-bounty"
                type="number"
                value={minBounty}
                onChange={(e) => setMinBounty(e.target.value)}
                placeholder="0"
                min={0}
                step={100}
                className="w-24 px-3 py-2 font-mono text-xs text-fg bg-bg focus:outline-none placeholder:text-muted/40"
                aria-label="Minimum bounty in satoshis"
              />
            </div>
          </div>
        </div>

        {/* Active type filter indicator */}
        {typeFilter !== "all" && (
          <div className="mb-6 flex items-center gap-3">
            <span className="text-xs font-mono text-muted">Showing:</span>
            <TaskTypeBadge taskType={typeFilter as TaskType} />
            <button
              type="button"
              onClick={() => setTypeFilter("all")}
              className="text-xs font-mono text-muted/60 hover:text-muted underline"
              aria-label="Clear task type filter"
            >
              clear
            </button>
          </div>
        )}

        {/* Content */}
        {loading && (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="border border-border p-6 h-48 bg-fg/[0.02] animate-pulse"
                aria-hidden="true"
              >
                <div className="h-3 bg-fg/8 w-16 mb-3" />
                <div className="h-5 bg-fg/8 w-3/4 mb-2" />
                <div className="h-3 bg-fg/8 w-full mb-1" />
                <div className="h-3 bg-fg/8 w-2/3" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div
            className="border border-danger/30 bg-danger/5 px-6 py-5 text-sm text-danger font-mono"
            role="alert"
          >
            {error}
            <button
              onClick={() => { setLoading(true); fetchBounties(); }}
              className="ml-4 underline hover:no-underline"
              aria-label="Retry loading bounties"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="border border-border py-20 text-center">
            <div className="font-display font-bold text-3xl tracking-tight text-fg/20 mb-4 select-none" aria-hidden="true">
              —
            </div>
            <p className="text-base text-muted mb-6">
              {typeFilter !== "all"
                ? `No active ${typeFilter.replace("_", " ")} bounties.`
                : "No active bounties."}
            </p>
            <Link
              href="/post"
              className="inline-flex items-center gap-2 border border-fg text-fg px-5 py-2.5 text-sm font-mono hover:bg-fg hover:text-bg transition-colors"
              aria-label="Post the first bounty"
            >
              Be the first to post one
            </Link>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {filtered.map((bounty) => (
              <BountyCard key={bounty.id} bounty={bounty} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
