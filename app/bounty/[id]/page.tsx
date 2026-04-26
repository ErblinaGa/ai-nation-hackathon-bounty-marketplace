"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import BidRow from "@/components/BidRow";
import CodeBlock from "@/components/CodeBlock";
import CodebaseContextView from "@/components/CodebaseContextView";
import BugBountyTargetView from "@/components/BugBountyTargetView";
import DiffViewer from "@/components/DiffViewer";
import TaskTypeBadge from "@/components/TaskTypeBadge";
import Countdown from "@/components/Countdown";
import StatusBadge from "@/components/StatusBadge";
import AuditorPanel from "@/components/AuditorPanel";
import type {
  AcceptBidRequest,
  AcceptBidResponse,
  BountyDetail,
  CodebasePayload,
  BugBountyPayload,
  PublicBid,
} from "@/lib/types";

const DEMO_PUBKEY = "02demo_poster_pubkey";

interface SettlementData {
  winnerPubkey: string;
  settledAmountSats: number;
  refundedSats: number;
  paymentHash: string;
  code: string;
  winnerBidType: string;
}

export default function BountyDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [bounty, setBounty] = useState<BountyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testSuiteOpen, setTestSuiteOpen] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<SettlementData | null>(null);
  const prevBidIds = useRef<Set<string>>(new Set());
  const [newBidIds, setNewBidIds] = useState<Set<string>>(new Set());

  const isPoster =
    bounty !== null && bounty.poster_pubkey === DEMO_PUBKEY;

  // Parse task_payload once — memoized
  const payload = useMemo(() => {
    if (!bounty?.task_payload) return null;
    try {
      return JSON.parse(bounty.task_payload) as CodebasePayload | BugBountyPayload;
    } catch {
      return null;
    }
  }, [bounty?.task_payload]);

  const fetchBounty = useCallback(async () => {
    try {
      const res = await fetch(`/api/bounty/${id}`, {
        headers: { "x-pubkey": DEMO_PUBKEY },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as BountyDetail;

      // Detect new bids
      const incoming = new Set(data.bids.map((b) => b.id));
      const fresh = new Set<string>();
      for (const bidId of incoming) {
        if (!prevBidIds.current.has(bidId)) fresh.add(bidId);
      }
      if (fresh.size > 0) {
        setNewBidIds(fresh);
        setTimeout(() => setNewBidIds(new Set()), 1000);
      }
      prevBidIds.current = incoming;

      setBounty(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bounty.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBounty();
    const pollId = setInterval(fetchBounty, 2000);
    return () => clearInterval(pollId);
  }, [fetchBounty]);

  async function handleAccept(bidId: string) {
    setAccepting(bidId);
    setAcceptError(null);
    try {
      const body: AcceptBidRequest = {
        bid_id: bidId,
        poster_pubkey: DEMO_PUBKEY,
      };
      const res = await fetch(`/api/bounty/${id}/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pubkey": DEMO_PUBKEY,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as AcceptBidResponse;
      const winningBid = bounty?.bids.find((b) => b.id === bidId);
      setSettlement({
        winnerPubkey: winningBid?.bidder_pubkey ?? "unknown",
        settledAmountSats: data.settled_amount_sats,
        refundedSats: data.refunded_to_poster_sats,
        paymentHash: data.payment_hash,
        code: data.code,
        winnerBidType: winningBid?.bid_type ?? "code",
      });
      fetchBounty();
    } catch (err) {
      setAcceptError(
        err instanceof Error ? err.message : "Failed to accept bid."
      );
    } finally {
      setAccepting(null);
    }
  }

  const sortedBids = bounty
    ? [...bounty.bids].sort((a, b) => a.asked_price_sats - b.asked_price_sats)
    : [];

  const passBids = sortedBids.filter((b) => b.test_status === "PASS");
  const pendingBids = sortedBids.filter((b) => b.test_status === "PENDING");
  const failBids = sortedBids.filter((b) => b.test_status === "FAIL");
  const orderedBids: PublicBid[] = [...passBids, ...pendingBids, ...failBids];

  // Loading skeleton
  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <nav className="border-b border-border">
          <div className="max-w-[1280px] mx-auto px-8 h-14 flex items-center">
            <Link href="/" className="font-display font-bold text-sm tracking-tight text-fg hover:text-accent transition-colors" aria-label="Home">
              LIGHTNING BOUNTIES
            </Link>
          </div>
        </nav>
        <div className="max-w-[1280px] mx-auto px-8 py-16">
          <div className="animate-pulse space-y-6">
            <div className="h-4 bg-fg/8 w-24" />
            <div className="h-10 bg-fg/8 w-2/3" />
            <div className="h-4 bg-fg/8 w-full" />
            <div className="h-4 bg-fg/8 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !bounty) {
    return (
      <div className="min-h-screen bg-bg">
        <nav className="border-b border-border">
          <div className="max-w-[1280px] mx-auto px-8 h-14 flex items-center justify-between">
            <Link href="/" className="font-display font-bold text-sm tracking-tight text-fg hover:text-accent transition-colors" aria-label="Home">
              LIGHTNING BOUNTIES
            </Link>
          </div>
        </nav>
        <div className="max-w-[1280px] mx-auto px-8 py-16">
          <div
            className="border border-danger/30 bg-danger/5 px-6 py-5 text-sm text-danger font-mono inline-block"
            role="alert"
          >
            {error ?? "Bounty not found."}
          </div>
          <div className="mt-4">
            <Link href="/bounties" className="text-xs font-mono text-muted hover:text-fg transition-colors underline">
              Back to bounties
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isSnippet = bounty.task_type === "snippet";
  const isCodebase = bounty.task_type === "codebase";
  const isBugBounty = bounty.task_type === "bug_bounty";
  const isGithubBounty = bounty.github_repo !== null && bounty.github_repo !== undefined;

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
            <Link href="/bounties" className="text-xs font-mono text-muted hover:text-fg transition-colors">
              Browse
            </Link>
            <Link href="/post" className="text-xs font-mono px-4 py-2 border border-fg text-fg hover:bg-fg hover:text-bg transition-colors">
              Post Bounty
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-[1280px] mx-auto px-8 py-12">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-10 text-xs font-mono text-muted">
          <Link href="/bounties" className="hover:text-fg transition-colors">
            Bounties
          </Link>
          <span>/</span>
          <span className="text-fg truncate max-w-xs">{bounty.title}</span>
        </div>

        {/* Top section — asymmetric */}
        <div className="grid grid-cols-12 gap-8 mb-12">
          <div className="col-span-8">
            {/* Language + Type + Status badges */}
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <span className="text-[10px] font-mono text-muted tracking-widest uppercase">
                {bounty.language}
              </span>
              <TaskTypeBadge taskType={bounty.task_type} />
              <StatusBadge variant={bounty.status} />
              {isGithubBounty && (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-muted border border-border px-2 py-0.5">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  <span>
                    {bounty.github_repo}
                    {bounty.github_issue_number !== null && (
                      <span className="text-accent">#{bounty.github_issue_number}</span>
                    )}
                  </span>
                </span>
              )}
              {isPoster && (
                <span className="text-[10px] font-mono text-accent tracking-widest border border-accent/30 px-2 py-0.5">
                  YOU ARE POSTER
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="font-display font-bold text-[52px] leading-[0.95] tracking-tightest text-fg mb-6">
              {bounty.title}
            </h1>

            {/* Description */}
            {bounty.description && (
              <p className="text-base text-muted leading-relaxed max-w-2xl mb-6">
                {bounty.description}
              </p>
            )}

            {/* ── GitHub PR link — prominent when settled ── */}
            {isGithubBounty && bounty.github_pr_url && (
              <div className="mb-6 border border-success/30 bg-success/[0.03] px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1">
                    Pull Request Opened
                  </div>
                  <span className="font-mono text-sm text-fg">
                    Winning diff applied — available for review on GitHub
                  </span>
                </div>
                <a
                  href={bounty.github_pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 font-mono text-xs border border-success text-success px-4 py-2 hover:bg-success hover:text-bg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success"
                  aria-label="View pull request on GitHub"
                >
                  VIEW PR ON GITHUB →
                </a>
              </div>
            )}

            {/* ── Task-type-specific content ── */}

            {/* Snippet: test suite expander */}
            {isSnippet && (
              <>
                <button
                  type="button"
                  onClick={() => setTestSuiteOpen((v) => !v)}
                  className="flex items-center gap-3 text-xs font-mono text-muted hover:text-fg transition-colors py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  aria-expanded={testSuiteOpen}
                  aria-controls="test-suite-panel"
                >
                  <span
                    className={`w-3.5 h-3.5 border border-current flex items-center justify-center transition-transform ${testSuiteOpen ? "rotate-45" : ""}`}
                    aria-hidden="true"
                  >
                    <span className="text-[9px] leading-none">+</span>
                  </span>
                  <span className="tracking-widest uppercase">
                    {testSuiteOpen ? "Hide Test Suite" : "View Test Suite"}
                  </span>
                  <span className="text-muted/50">
                    — hash: {bounty.test_suite_hash.slice(0, 12)}…
                  </span>
                </button>
                {testSuiteOpen && (
                  <div id="test-suite-panel" className="mt-4">
                    <CodeBlock
                      code={bounty.test_suite}
                      language={bounty.language}
                      maxHeightClass="max-h-72"
                    />
                  </div>
                )}
              </>
            )}

            {/* Codebase: context file tree */}
            {isCodebase && payload && (
              <div className="mt-2">
                <CodebaseContextView payload={payload as CodebasePayload} />
              </div>
            )}

            {/* Bug Bounty: target code + symptom */}
            {isBugBounty && payload && (
              <div className="mt-2">
                <BugBountyTargetView payload={payload as BugBountyPayload} />
              </div>
            )}

            {/* ── Auditor Panel — GitHub bounties only ── */}
            {isGithubBounty && (
              <div className="mt-8">
                <AuditorPanel bounty={bounty} />
              </div>
            )}
          </div>

          {/* Right sidebar — bounty stats */}
          <div className="col-span-4">
            <div className="border border-border p-6 sticky top-8">
              {/* Max bounty — the big number */}
              <div className="mb-6 pb-6 border-b border-border">
                <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1.5">
                  Max Bounty
                </div>
                <div className="font-mono font-bold text-4xl tracking-tightest text-accent tabular-nums">
                  {bounty.max_bounty_sats.toLocaleString()}
                </div>
                <div className="text-xs font-mono text-muted mt-0.5">satoshis</div>
              </div>

              {/* Deadline */}
              <div className="mb-4">
                <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1.5">
                  Deadline
                </div>
                {bounty.status === "OPEN" ? (
                  <Countdown deadlineAt={bounty.deadline_at} className="text-2xl" />
                ) : (
                  <StatusBadge variant={bounty.status} />
                )}
              </div>

              {/* Bid counts */}
              <div className="mb-4 pb-4 border-b border-border">
                <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-2">
                  Bids
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono font-bold text-2xl text-fg tabular-nums">
                    {bounty.bid_count}
                  </span>
                  <span className="text-xs font-mono text-muted">total</span>
                  <span className="text-muted">·</span>
                  <span className="font-mono font-bold text-2xl text-success tabular-nums">
                    {bounty.passing_bid_count}
                  </span>
                  <span className="text-xs font-mono text-muted">passing</span>
                </div>
              </div>

              {/* Stake per bid */}
              <div>
                <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1">
                  Agent bid stake
                </div>
                <div className="font-mono text-sm text-fg">
                  {bounty.bid_stake_sats.toLocaleString()} sats
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bid list section */}
        <section aria-label="Bids">
          <div className="flex items-center gap-4 mb-4">
            <div className="text-xs font-mono text-muted tracking-widest uppercase">
              Live Bids
            </div>
            <div className="flex-1 h-px bg-border" />
            {bounty.status === "OPEN" && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-amber" aria-hidden="true" />
                <span className="text-xs font-mono text-muted">updating</span>
              </>
            )}
          </div>

          {/* Bids table header */}
          {orderedBids.length > 0 && (
            <div className="border border-border">
              {/* Column headers */}
              <div
                className="flex items-center gap-4 px-4 py-2 bg-fg/[0.02] border-b border-border"
                role="rowgroup"
                aria-label="Table header"
              >
                <div className="w-20 flex-shrink-0 text-[10px] font-mono text-muted tracking-widest uppercase">
                  Status
                </div>
                <div className="w-28 flex-shrink-0 text-[10px] font-mono text-muted tracking-widest uppercase">
                  Bidder
                </div>
                <div className="w-32 flex-shrink-0 text-[10px] font-mono text-muted tracking-widest uppercase">
                  Price
                </div>
                <div className="flex-1 text-[10px] font-mono text-muted tracking-widest uppercase">
                  {isSnippet ? "Metadata" : "Type"}
                </div>
                <div className="w-32 flex-shrink-0 text-[10px] font-mono text-muted tracking-widest uppercase hidden lg:block">
                  Code Hash
                </div>
                <div className="w-20 flex-shrink-0 text-[10px] font-mono text-muted tracking-widest uppercase hidden sm:block">
                  Bid Status
                </div>
                <div className="w-24 flex-shrink-0" />
              </div>

              {/* Bid rows */}
              <div role="table" aria-label="Bid list">
                {orderedBids.map((bid) => (
                  <BidRow
                    key={bid.id}
                    bid={bid}
                    isPoster={isPoster && !isGithubBounty}
                    onAccept={isGithubBounty ? undefined : handleAccept}
                    isNew={newBidIds.has(bid.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {orderedBids.length === 0 && bounty.status === "OPEN" && (
            <div className="border border-border py-16 text-center">
              <div
                className="font-display font-bold text-4xl tracking-tightest text-fg/10 mb-4 select-none"
                aria-hidden="true"
              >
                …
              </div>
              <p className="text-sm text-muted font-mono">
                Waiting for agents to bid
              </p>
            </div>
          )}

          {accepting && (
            <div className="mt-4 border border-accent/30 bg-accent/5 px-4 py-3 text-sm font-mono text-amber">
              Accepting bid, settling via Lightning…
            </div>
          )}

          {acceptError && (
            <div
              className="mt-4 border border-danger/30 bg-danger/5 px-4 py-3 text-sm font-mono text-danger"
              role="alert"
            >
              {acceptError}
            </div>
          )}
        </section>

        {/* Settlement section — appears after accept */}
        {settlement && (
          <section
            className="mt-16 border border-success/30 bg-success/[0.03] p-8"
            aria-label="Settlement details"
          >
            <div className="flex items-center gap-3 mb-8">
              <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" aria-hidden="true" />
              <h2 className="font-display font-bold text-2xl tracking-tight text-fg">
                Settlement Complete
              </h2>
            </div>

            <div className="grid grid-cols-12 gap-8">
              <div className="col-span-7">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-px bg-border border border-border mb-8">
                  {[
                    { label: "Settled to Winner", value: settlement.settledAmountSats.toLocaleString(), suffix: "sats" },
                    { label: "Refunded to Poster", value: settlement.refundedSats.toLocaleString(), suffix: "sats" },
                    { label: "Winner Pubkey", value: `${settlement.winnerPubkey.slice(0, 8)}…`, suffix: "" },
                  ].map((item) => (
                    <div key={item.label} className="bg-bg px-5 py-5">
                      <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1.5">
                        {item.label}
                      </div>
                      <div className="font-mono font-bold text-xl text-fg tabular-nums">
                        {item.value}
                        {item.suffix && (
                          <span className="text-xs text-muted font-normal ml-1">
                            {item.suffix}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Payment hash */}
                <div className="mb-6">
                  <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1.5">
                    Lightning Payment Hash
                  </div>
                  <div
                    className="font-mono text-xs text-fg/80 break-all border border-border px-3 py-2 bg-fg/[0.02]"
                    aria-label={`Payment hash: ${settlement.paymentHash}`}
                  >
                    {settlement.paymentHash}
                  </div>
                </div>

                {/* Revealed code — diff for codebase/bug_bounty, plain code for snippet */}
                <div>
                  <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-3">
                    {settlement.winnerBidType === "diff" ? "Revealed Diff" : "Revealed Code"}
                  </div>
                  {settlement.winnerBidType === "diff" ? (
                    <DiffViewer diff={settlement.code} />
                  ) : (
                    <CodeBlock
                      code={settlement.code}
                      language={bounty.language}
                      maxHeightClass="max-h-96"
                    />
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
