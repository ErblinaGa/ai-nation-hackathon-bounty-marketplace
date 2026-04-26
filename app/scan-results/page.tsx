"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ScanCandidateCard from "@/components/ScanCandidateCard";
import type { ScanSeverity } from "@/components/ScanCandidateCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScanCandidate {
  id: string;
  scan_id: string;
  repo: string;
  title: string;
  body: string;
  severity: ScanSeverity;
  files_affected: string[];
  estimated_loc: number;
  suggested_sats: number;
  status: string;
  bounty_id?: string;
  issue_number?: number;
}

interface ApplyResult {
  candidate_id: string;
  bounty_id: string;
  issue_number: number;
  issue_url: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Severity sort order
// ---------------------------------------------------------------------------

const SEV_ORDER: Record<ScanSeverity, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ScanResultsPage() {
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scan_id");
  const repoParam = searchParams.get("repo");

  const [candidates, setCandidates] = useState<ScanCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyResults, setApplyResults] = useState<ApplyResult[] | null>(null);
  const [repo, setRepo] = useState<string>("");

  // ---------------------------------------------------------------------------
  // Fetch candidates
  // ---------------------------------------------------------------------------

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let url = "";
      if (scanId) {
        url = `/api/scan?scan_id=${encodeURIComponent(scanId)}`;
      } else if (repoParam) {
        url = `/api/scan?repo=${encodeURIComponent(repoParam)}&latest=true`;
      } else {
        setError("No scan_id or repo parameter provided.");
        setLoading(false);
        return;
      }

      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as {
        success: boolean;
        data?: {
          scan_id: string;
          repo?: string;
          candidates: ScanCandidate[];
        };
        error?: string;
      };

      if (!data.success) throw new Error(data.error ?? "Unknown error");

      const sorted = [...(data.data?.candidates ?? [])].sort(
        (a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity],
      );

      setCandidates(sorted);
      setRepo(data.data?.repo ?? repoParam ?? "");

      // Pre-select all PENDING candidates
      const preSelected = new Set(
        sorted.filter((c) => c.status === "PENDING").map((c) => c.id),
      );
      setSelected(preSelected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scan results.");
    } finally {
      setLoading(false);
    }
  }, [scanId, repoParam]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  // ---------------------------------------------------------------------------
  // Selection handlers
  // ---------------------------------------------------------------------------

  function toggleCandidate(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleTitleChange(id: string, title: string) {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c)),
    );
  }

  function handleSatsChange(id: string, sats: number) {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, suggested_sats: sats } : c)),
    );
  }

  function toggleAll() {
    const pending = candidates.filter((c) => c.status === "PENDING").map((c) => c.id);
    if (pending.every((id) => selected.has(id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pending));
    }
  }

  // ---------------------------------------------------------------------------
  // Apply
  // ---------------------------------------------------------------------------

  async function handleApply() {
    const ids = Array.from(selected).filter((id) => {
      const c = candidates.find((x) => x.id === id);
      return c && c.status === "PENDING";
    });

    if (ids.length === 0) return;
    setApplying(true);
    setApplyResults(null);

    try {
      const res = await fetch("/api/scan/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_ids: ids }),
      });

      const data = await res.json() as {
        success: boolean;
        data?: { applied: ApplyResult[] };
        error?: string;
      };

      if (!data.success && !data.data) {
        throw new Error(data.error ?? "Apply failed");
      }

      const results = data.data?.applied ?? [];
      setApplyResults(results);

      // Update candidate statuses locally
      const appliedMap = new Map(
        results
          .filter((r) => !r.error && r.bounty_id)
          .map((r) => [r.candidate_id, r]),
      );

      setCandidates((prev) =>
        prev.map((c) => {
          const r = appliedMap.get(c.id);
          if (!r) return c;
          return {
            ...c,
            status: "APPLIED",
            bounty_id: r.bounty_id,
            issue_number: r.issue_number,
          };
        }),
      );

      // Deselect applied candidates
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of appliedMap.keys()) next.delete(id);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed.");
    } finally {
      setApplying(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const pendingCount = candidates.filter((c) => c.status === "PENDING").length;
  const selectedPending = Array.from(selected).filter((id) => {
    const c = candidates.find((x) => x.id === id);
    return c && c.status === "PENDING";
  }).length;

  const highCount = candidates.filter((c) => c.severity === "HIGH").length;
  const mediumCount = candidates.filter((c) => c.severity === "MEDIUM").length;
  const lowCount = candidates.filter((c) => c.severity === "LOW").length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <nav className="border-b border-border">
        <div className="max-w-[1280px] mx-auto px-8 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="font-display font-bold text-sm tracking-tight text-fg hover:text-accent transition-colors"
          >
            LIGHTNING BOUNTIES
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/bounties"
              className="text-xs font-mono text-muted hover:text-fg transition-colors"
            >
              Bounties
            </Link>
            <Link
              href="/post"
              className="text-xs font-mono px-4 py-2 border border-fg text-fg hover:bg-fg hover:text-bg transition-colors"
            >
              Post Bounty
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-[1280px] mx-auto px-8 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-6 h-px bg-accent" />
            <span className="text-xs font-mono text-muted tracking-widest uppercase">
              Scan Results
            </span>
            {repo && (
              <>
                <span className="text-xs font-mono text-muted/40">/</span>
                <span className="text-xs font-mono text-muted">{repo}</span>
              </>
            )}
          </div>

          <div className="flex items-end justify-between gap-8">
            <div>
              <h1 className="font-display font-bold text-5xl tracking-tightest text-fg mb-2">
                AI Code Review
              </h1>
              {!loading && !error && candidates.length > 0 && (
                <div className="flex items-center gap-4 font-mono text-xs text-muted">
                  {highCount > 0 && (
                    <span>
                      <span className="text-[#ff4500] font-bold">{highCount}</span> HIGH
                    </span>
                  )}
                  {mediumCount > 0 && (
                    <span>
                      <span className="text-[#f59e0b] font-bold">{mediumCount}</span> MEDIUM
                    </span>
                  )}
                  {lowCount > 0 && (
                    <span>
                      <span className="text-muted font-bold">{lowCount}</span> LOW
                    </span>
                  )}
                  <span className="text-muted/40">·</span>
                  <span>
                    <span className="text-fg">{pendingCount}</span> pending
                  </span>
                </div>
              )}
            </div>

            {/* Scan ID */}
            {scanId && (
              <div className="text-[10px] font-mono text-muted/40 text-right">
                <div>SCAN</div>
                <div className="text-muted/60">{scanId.slice(0, 24)}…</div>
              </div>
            )}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="border border-border h-24 bg-fg/[0.02] animate-pulse"
                aria-hidden="true"
              />
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
              onClick={fetchCandidates}
              className="ml-4 underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && candidates.length === 0 && (
          <div className="border border-border py-20 text-center">
            <p className="font-mono text-sm text-muted">No candidates found for this scan.</p>
          </div>
        )}

        {/* Candidates */}
        {!loading && !error && candidates.length > 0 && (
          <>
            {/* Select all bar */}
            <div className="flex items-center justify-between mb-4 border-b border-border pb-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pendingCount > 0 && selectedPending === pendingCount}
                  onChange={toggleAll}
                  className="w-4 h-4 accent-fg"
                  aria-label="Select all pending candidates"
                />
                <span className="text-xs font-mono text-muted">
                  {selectedPending === 0
                    ? "Select all"
                    : `${selectedPending} of ${pendingCount} selected`}
                </span>
              </label>

              <div className="flex items-center gap-2 text-[10px] font-mono text-muted/50">
                <span>Click title to edit</span>
                <span>·</span>
                <span>Click sats to adjust</span>
              </div>
            </div>

            {/* Candidate list */}
            <div className="space-y-2 mb-8">
              {candidates.map((c, idx) => (
                <ScanCandidateCard
                  key={c.id}
                  candidate={c}
                  index={idx}
                  selected={selected.has(c.id)}
                  onToggle={toggleCandidate}
                  onTitleChange={handleTitleChange}
                  onSatsChange={handleSatsChange}
                />
              ))}
            </div>

            {/* Apply bar */}
            {pendingCount > 0 && (
              <div className="sticky bottom-0 border-t border-border bg-bg pt-5 pb-6">
                <div className="flex items-center justify-between gap-6">
                  <div className="text-xs font-mono text-muted">
                    {selectedPending === 0 ? (
                      <span className="text-muted/40">No candidates selected</span>
                    ) : (
                      <span>
                        <span className="text-fg font-bold">{selectedPending}</span> candidate
                        {selectedPending !== 1 ? "s" : ""} selected
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={selectedPending === 0 || applying}
                    className="font-mono text-sm px-8 py-3 border border-fg text-fg hover:bg-fg hover:text-bg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={`File ${selectedPending} selected as bounties`}
                  >
                    {applying
                      ? "Filing..."
                      : `File ${selectedPending} as bounti${selectedPending !== 1 ? "es" : "y"}`}
                  </button>
                </div>
              </div>
            )}

            {/* Apply results */}
            {applyResults && applyResults.length > 0 && (
              <div className="mt-8 border border-border">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="font-mono text-sm font-bold text-fg">Filed Bounties</h2>
                </div>
                <div className="divide-y divide-border">
                  {applyResults.map((r) => {
                    const cand = candidates.find((c) => c.id === r.candidate_id);
                    if (r.error) {
                      return (
                        <div key={r.candidate_id} className="px-6 py-4 flex items-start gap-4">
                          <span className="font-mono text-[10px] text-danger border border-danger/30 px-2 py-0.5 shrink-0">
                            FAILED
                          </span>
                          <div>
                            <p className="font-mono text-xs text-fg/60 mb-1">
                              {cand?.title ?? r.candidate_id}
                            </p>
                            <p className="font-mono text-xs text-danger/80">{r.error}</p>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={r.candidate_id} className="px-6 py-4 flex items-start gap-4">
                        <span className="font-mono text-[10px] bg-fg text-bg px-2 py-0.5 shrink-0">
                          FILED
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-xs text-fg mb-2 truncate">
                            {cand?.title ?? r.candidate_id}
                          </p>
                          <div className="flex items-center gap-4 font-mono text-[10px] text-muted">
                            <a
                              href={r.issue_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-accent underline"
                            >
                              Issue #{r.issue_number}
                            </a>
                            <span className="text-muted/40">·</span>
                            <a
                              href={`/bounty/${r.bounty_id}`}
                              className="hover:text-accent underline"
                            >
                              Bounty {r.bounty_id}
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
