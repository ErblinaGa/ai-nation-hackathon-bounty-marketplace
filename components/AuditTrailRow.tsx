"use client";

import { useState } from "react";
import type { AuditorBidScore, AuditorWeights } from "@/lib/types";

interface AuditTrailRowProps {
  score: AuditorBidScore;
  rank: number;
}

// Criterion labels — display names for per-criterion keys (V2.5 quality-only weights)
const CRITERION_LABELS: Record<keyof AuditorWeights, string> = {
  code_quality: "Code Quality",
  completeness: "Completeness",
  convention_match: "Convention",
  test_appropriateness: "Tests",
  maintainability: "Maintainability",
  no_new_deps: "No New Deps",
  security: "Security",
};

function truncatePubkey(pk: string): string {
  if (pk.length <= 14) return pk;
  return `${pk.slice(0, 8)}…${pk.slice(-6)}`;
}

// Simple integer percent — no decimals
function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export default function AuditTrailRow({ score, rank }: AuditTrailRowProps) {
  const [reasoningOpen, setReasoningOpen] = useState(score.chosen);

  const criterionKeys = Object.keys(CRITERION_LABELS) as Array<keyof AuditorWeights>;

  return (
    <div
      className={`border-b border-border last:border-b-0 ${
        score.chosen
          ? "border-l-2 border-l-accent bg-accent/[0.02]"
          : "border-l-2 border-l-transparent"
      }`}
      role="listitem"
      aria-label={`Bid ${rank} — ${score.chosen ? "Winner" : "Candidate"}`}
    >
      <div className="px-5 py-4">
        {/* Top row — rank, pubkey, total score, winner badge */}
        <div className="flex items-center gap-4 mb-3">
          {/* Rank */}
          <div
            className="w-6 h-6 border border-border flex items-center justify-center flex-shrink-0"
            aria-hidden="true"
          >
            <span className="font-mono text-[10px] text-muted">{rank}</span>
          </div>

          {/* Bidder pubkey */}
          <span
            className="font-mono text-xs text-fg flex-1 truncate"
            title={score.bidder_pubkey}
            aria-label={`Bidder: ${score.bidder_pubkey}`}
          >
            {truncatePubkey(score.bidder_pubkey)}
          </span>

          {/* Winner badge */}
          {score.chosen && (
            <span
              className="text-[10px] font-mono text-accent border border-accent/40 px-2 py-0.5 tracking-widest flex-shrink-0"
              aria-label="Winner"
            >
              WINNER
            </span>
          )}

          {/* Total score — the big number */}
          <div className="text-right flex-shrink-0">
            <div className="font-mono font-bold text-xl text-fg tabular-nums">
              {pct(score.total_score)}
            </div>
            <div className="text-[9px] font-mono text-muted tracking-widest uppercase">
              Score
            </div>
          </div>
        </div>

        {/* Total score bar */}
        <div className="mb-4">
          <div
            className="h-2 bg-border w-full"
            role="progressbar"
            aria-valuenow={Math.round(score.total_score * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Total score: ${pct(score.total_score)}`}
          >
            <div
              className="h-full bg-accent"
              style={{ width: `${score.total_score * 100}%` }}
            />
          </div>
        </div>

        {/* Per-criterion mini-bars — 6-col grid */}
        <div className="grid grid-cols-6 gap-2 mb-3">
          {criterionKeys.map((key) => {
            const val = score.per_criterion[key] ?? 0;
            return (
              <div key={key} className="flex flex-col gap-1">
                {/* Mini bar */}
                <div
                  className="h-1 bg-border w-full"
                  role="progressbar"
                  aria-valuenow={Math.round(val * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${CRITERION_LABELS[key]}: ${pct(val)}`}
                >
                  <div
                    className="h-full bg-fg/40"
                    style={{ width: `${val * 100}%` }}
                  />
                </div>
                {/* Label + value */}
                <div className="text-[9px] font-mono text-muted tracking-widest uppercase leading-tight truncate">
                  {CRITERION_LABELS[key]}
                </div>
                <div className="text-[9px] font-mono text-fg/70 tabular-nums">
                  {pct(val)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Reasoning toggle */}
        <button
          type="button"
          onClick={() => setReasoningOpen((v) => !v)}
          className="flex items-center gap-2 text-[10px] font-mono text-muted hover:text-fg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent py-1"
          aria-expanded={reasoningOpen}
          aria-controls={`reasoning-${score.bid_id}`}
        >
          <span
            className={`w-3 h-3 border border-current flex items-center justify-center transition-transform ${
              reasoningOpen ? "rotate-45" : ""
            }`}
            aria-hidden="true"
          >
            <span className="text-[8px] leading-none">+</span>
          </span>
          <span className="tracking-widest uppercase">
            {reasoningOpen ? "Hide Reasoning" : "Show Reasoning"}
          </span>
        </button>

        {/* Reasoning — mono with accent border-left */}
        {reasoningOpen && (
          <div
            id={`reasoning-${score.bid_id}`}
            className="mt-3 border-l-2 border-accent pl-4 py-1"
          >
            <p className="font-mono text-xs text-muted leading-relaxed">
              {score.reasoning}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
