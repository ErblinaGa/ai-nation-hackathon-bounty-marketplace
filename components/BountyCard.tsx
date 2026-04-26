import Link from "next/link";
import type { AuditorResult, BountyListItem } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import Countdown from "./Countdown";
import TaskTypeBadge from "./TaskTypeBadge";

function GitHubMark({ size = 11 }: { size?: number }) {
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

function truncatePubkey(pk: string): string {
  if (pk.length <= 12) return pk;
  return `${pk.slice(0, 6)}…${pk.slice(-4)}`;
}

interface BountyCardProps {
  bounty: BountyListItem;
  /** Optional auditor result — shown as badge when winner is picked */
  auditorResult?: AuditorResult | null;
}

export default function BountyCard({ bounty, auditorResult }: BountyCardProps) {
  const winner = auditorResult?.ranked.find((s) => s.chosen) ?? null;
  return (
    <Link
      href={`/bounty/${bounty.id}`}
      className="group block border border-border bg-bg hover:border-fg/30 transition-colors duration-150"
      aria-label={`View bounty: ${bounty.title}`}
    >
      <div className="p-6">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-muted tracking-widest uppercase">
              {bounty.language}
            </span>
            <StatusBadge variant={bounty.status} />
            <TaskTypeBadge taskType={bounty.task_type} />
          </div>
          <Countdown deadlineAt={bounty.deadline_at} className="text-xs" />
        </div>

        {/* Title */}
        <h3 className="font-display font-bold text-xl tracking-tight text-fg mb-2 group-hover:text-fg leading-tight">
          {bounty.title}
        </h3>

        {/* GitHub issue subtitle */}
        {bounty.github_repo && (
          <div className="flex items-center gap-1.5 mb-2">
            <GitHubMark />
            <span className="font-mono text-[10px] text-muted tracking-tight">
              {bounty.github_repo}
              {bounty.github_issue_number !== null && (
                <span className="text-accent">#{bounty.github_issue_number}</span>
              )}
            </span>
          </div>
        )}

        {/* Description */}
        <p className="text-sm text-muted leading-relaxed line-clamp-2 mb-3">
          {bounty.description}
        </p>

        {/* Task-type contextual hints */}
        {bounty.task_type === "codebase" && (
          <div className="mb-3 flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted/60 tracking-widest uppercase">
              submit diff
            </span>
          </div>
        )}
        {bounty.task_type === "bug_bounty" && (
          <div className="mb-3 flex items-center gap-2">
            <span className="font-mono text-[10px] text-danger/60 tracking-widest uppercase">
              fix &amp; prove
            </span>
          </div>
        )}
        {bounty.task_type === "snippet" && <div className="mb-3" />}

        {/* Bottom row */}
        <div className="flex items-end justify-between">
          {/* Bounty amount — the big number */}
          <div>
            <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-0.5">
              Max Bounty
            </div>
            <div className="font-mono font-semibold text-2xl tracking-tightest text-accent tabular-nums">
              {bounty.max_bounty_sats.toLocaleString()}
              <span className="text-xs text-muted ml-1 font-normal">sats</span>
            </div>
          </div>

          {/* Bid counts — or auditor winner badge */}
          <div className="text-right">
            {winner ? (
              <div>
                <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-0.5">
                  Audited
                </div>
                <div
                  className="font-mono text-xs text-accent border border-accent/30 px-2 py-0.5 inline-block"
                  title={winner.bidder_pubkey}
                  aria-label={`Auditor winner: ${winner.bidder_pubkey}`}
                >
                  {truncatePubkey(winner.bidder_pubkey)}
                </div>
              </div>
            ) : (
              <div>
                <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-0.5">
                  Bids
                </div>
                <div className="font-mono text-sm text-fg tabular-nums">
                  <span className="text-fg font-semibold">{bounty.bid_count}</span>
                  <span className="text-muted mx-1">/</span>
                  <span className="text-success font-semibold">{bounty.passing_bid_count}</span>
                  <span className="text-muted text-xs ml-1">passing</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom accent line — appears on hover */}
      <div className="h-px w-0 group-hover:w-full bg-accent transition-all duration-300" />
    </Link>
  );
}
