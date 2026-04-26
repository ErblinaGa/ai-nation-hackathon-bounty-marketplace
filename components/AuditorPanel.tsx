"use client";

import type { BountyDetail } from "@/lib/types";
import Countdown from "./Countdown";
import AuditTrailRow from "./AuditTrailRow";

interface AuditorPanelProps {
  bounty: BountyDetail;
}

// ── State A: deadline hasn't passed, no audit result yet
function AwaitingAudit({ bounty }: { bounty: BountyDetail }) {
  return (
    <div className="border border-border p-6 bg-fg/[0.015]">
      <div className="flex items-center gap-3 mb-5">
        <span className="w-1.5 h-1.5 bg-amber flex-shrink-0 animate-pulse-amber" aria-hidden="true" />
        <span className="text-xs font-mono text-muted tracking-widest uppercase">
          Auditor
        </span>
      </div>

      <h3 className="font-display font-bold text-xl tracking-tight text-fg mb-2">
        Awaiting Auditor Decision
      </h3>
      <p className="text-sm text-muted font-mono leading-relaxed mb-6">
        The autonomous auditor will evaluate all passing bids after the deadline. No manual acceptance is required.
      </p>

      <div className="border-t border-border pt-5">
        <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1.5">
          Bidding Closes In
        </div>
        <Countdown deadlineAt={bounty.deadline_at} className="text-2xl" />
      </div>

      {bounty.extension_count > 0 && (
        <div className="mt-4 border border-amber/30 bg-amber/[0.05] px-4 py-3">
          <span className="text-xs font-mono text-amber">
            Round {bounty.extension_count + 1} — deadline was extended {bounty.extension_count}× due to low scores.
          </span>
        </div>
      )}
    </div>
  );
}

// ── State B: auditor ran but decided to REOPEN_BIDDING
function ReopenState({ bounty }: { bounty: BountyDetail }) {
  const result = bounty.auditor_result!;
  const round = bounty.extension_count + 1;
  const maxRounds = (bounty.auditor_config?.max_extensions ?? 2) + 1;

  return (
    <div className="border border-amber/30 bg-amber/[0.03] p-6">
      <div className="flex items-center gap-3 mb-5">
        <span className="w-1.5 h-1.5 bg-amber flex-shrink-0" aria-hidden="true" />
        <span className="text-xs font-mono text-amber tracking-widest uppercase">
          Bidding Extended
        </span>
      </div>

      <h3 className="font-display font-bold text-xl tracking-tight text-fg mb-2">
        Auditor Extended Deadline — Round {round}/{maxRounds}
      </h3>
      <p className="text-sm text-muted font-mono leading-relaxed mb-3">
        Top score was below threshold ({Math.round(result.confidence * 100)}%). New bids are welcome; existing passing bids remain valid.
      </p>

      {result.notes && (
        <div className="border-l-2 border-amber pl-4 mb-5">
          <p className="font-mono text-xs text-muted leading-relaxed">{result.notes}</p>
        </div>
      )}

      <div className="mb-6 pb-5 border-b border-border">
        <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1.5">
          New Deadline
        </div>
        <Countdown deadlineAt={bounty.deadline_at} className="text-2xl" />
      </div>

      {/* Ranked candidates so far */}
      {result.ranked.length > 0 && (
        <div>
          <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-3">
            Current Rankings
          </div>
          <div className="border border-border">
            {result.ranked.map((s, i) => (
              <AuditTrailRow key={s.bid_id} score={s} rank={i + 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── State C + D: auditor picked a winner (PICK_WINNER or FALLBACK_PICK)
function WinnerState({ bounty }: { bounty: BountyDetail }) {
  const result = bounty.auditor_result!;
  const winner = result.ranked.find((s) => s.chosen);
  const isFallback = result.decision === "FALLBACK_PICK";

  return (
    <div className="border border-border p-6 bg-fg/[0.015]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <span className="w-1.5 h-1.5 bg-success flex-shrink-0" aria-hidden="true" />
        <span className="text-xs font-mono text-success tracking-widest uppercase">
          {isFallback ? "Fallback Winner Selected" : "Auditor Decision"}
        </span>
      </div>

      {/* PR link — prominent when settled */}
      {bounty.github_pr_url && (
        <div className="mb-6 border border-success/30 bg-success/[0.03] px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1">
              Pull Request Opened
            </div>
            <span className="font-mono text-sm text-fg">
              Winning diff applied and PR opened on GitHub
            </span>
          </div>
          <a
            href={bounty.github_pr_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 font-mono text-xs border border-success text-success px-4 py-2 hover:bg-success hover:text-bg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success"
            aria-label="View pull request on GitHub"
          >
            VIEW PR →
          </a>
        </div>
      )}

      {/* Winner highlight card */}
      {winner && (
        <div className="mb-6 border-2 border-accent p-5 bg-accent/[0.02]">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1">
                Selected Winner
              </div>
              <div
                className="font-mono text-sm text-fg"
                title={winner.bidder_pubkey}
              >
                {winner.bidder_pubkey.length > 14
                  ? `${winner.bidder_pubkey.slice(0, 10)}…${winner.bidder_pubkey.slice(-6)}`
                  : winner.bidder_pubkey}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono font-bold text-3xl text-accent tabular-nums">
                {Math.round(winner.total_score * 100)}%
              </div>
              <div className="text-[9px] font-mono text-muted tracking-widest uppercase">
                Confidence
              </div>
            </div>
          </div>

          {winner.reasoning && (
            <div className="border-l-2 border-accent pl-4 mt-3">
              <p className="font-mono text-xs text-muted leading-relaxed">
                {winner.reasoning}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Auditor notes */}
      {result.notes && (
        <div className="mb-6">
          <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-2">
            Auditor Notes
          </div>
          <div className="border-l-2 border-border pl-4">
            <p className="font-mono text-xs text-muted leading-relaxed">{result.notes}</p>
          </div>
        </div>
      )}

      {/* Full audit trail */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[10px] font-mono text-muted tracking-widest uppercase">
            Full Audit Trail
          </span>
          <div className="flex-1 h-px bg-border" />
          <span className="text-[10px] font-mono text-muted">
            {result.ranked.length} bid{result.ranked.length !== 1 ? "s" : ""} evaluated
          </span>
        </div>
        <div className="border border-border" role="list" aria-label="Audit trail">
          {result.ranked.map((s, i) => (
            <AuditTrailRow key={s.bid_id} score={s} rank={i + 1} />
          ))}
        </div>
        <div className="mt-2 text-[10px] font-mono text-muted/60">
          Audited {new Date(result.audited_at).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

export default function AuditorPanel({ bounty }: AuditorPanelProps) {
  const result = bounty.auditor_result;

  // State D / C: winner picked
  if (result && (result.decision === "PICK_WINNER" || result.decision === "FALLBACK_PICK")) {
    return <WinnerState bounty={bounty} />;
  }

  // State B: re-open bidding
  if (result && result.decision === "REOPEN_BIDDING") {
    return <ReopenState bounty={bounty} />;
  }

  // State A: no result yet
  return <AwaitingAudit bounty={bounty} />;
}
