import type { PublicBid, EnsembleMetadata } from "@/lib/types";
import StatusBadge from "./StatusBadge";

interface EnsembleBidRowProps {
  bid: PublicBid;
  isPoster: boolean;
  onAccept?: (bidId: string) => void;
  isNew?: boolean;
}

function truncatePubkey(pubkey: string): string {
  if (pubkey.length <= 12) return pubkey;
  return `${pubkey.slice(0, 6)}…${pubkey.slice(-4)}`;
}

function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function shortenModelName(model: string): string {
  // "claude-haiku-4-5" -> "haiku", "claude-sonnet-4-5" -> "sonnet" etc.
  const lower = model.toLowerCase();
  if (lower.includes("haiku")) return "haiku";
  if (lower.includes("sonnet")) return "sonnet";
  if (lower.includes("opus")) return "opus";
  // fallback: last segment of hyphenated name
  const parts = model.split("-");
  return parts[parts.length - 1] ?? model;
}

interface CandidatePillProps {
  model: string;
  passed: boolean;
  runtime_ms: number;
  chosen: boolean;
}

function CandidatePill({ model, passed, runtime_ms, chosen }: CandidatePillProps) {
  const base = "flex items-center gap-1.5 px-2.5 py-1.5 border font-mono text-[10px] tracking-wide transition-colors";
  const style = chosen
    ? "border-accent bg-accent/10 text-amber"
    : passed
    ? "border-success/30 bg-success/5 text-success/80"
    : "border-border bg-fg/[0.02] text-muted";

  return (
    <div
      className={`${base} ${style}`}
      title={`${model} — ${passed ? "passed" : "failed"} — ${runtime_ms}ms${chosen ? " — chosen" : ""}`}
      aria-label={`${model}: ${passed ? "passed" : "failed"} in ${runtime_ms}ms${chosen ? ", chosen" : ""}`}
    >
      <span>{shortenModelName(model)}</span>
      <span className={passed ? "text-success" : "text-danger/70"}>
        {passed ? "✓" : "✗"}
      </span>
      <span className="opacity-60">{(runtime_ms / 1000).toFixed(1)}s</span>
      {chosen && (
        <span className="ml-0.5 text-accent" aria-label="selected">▶</span>
      )}
    </div>
  );
}

export default function EnsembleBidRow({
  bid,
  isPoster,
  onAccept,
  isNew = false,
}: EnsembleBidRowProps) {
  const meta = bid.ensemble_metadata as EnsembleMetadata;
  const canAccept = isPoster && bid.status === "PASS";

  return (
    <div
      className={`border-b border-border last:border-b-0 ${isNew ? "animate-slide-in" : ""}`}
      role="row"
    >
      <div className="px-4 py-3.5 hover:bg-fg/[0.02] transition-colors">
        {/* Top row — mirrors BidRow layout */}
        <div className="flex items-center gap-4">
          {/* Status badge */}
          <div className="w-20 flex-shrink-0">
            <StatusBadge variant={bid.test_status} />
          </div>

          {/* Bidder pubkey */}
          <div className="w-28 flex-shrink-0">
            <span
              className="font-mono text-xs text-muted hover:text-fg transition-colors cursor-default"
              title={bid.bidder_pubkey}
              aria-label={`Bidder pubkey: ${bid.bidder_pubkey}`}
            >
              {truncatePubkey(bid.bidder_pubkey)}
            </span>
          </div>

          {/* Price */}
          <div className="w-32 flex-shrink-0">
            <span className="font-mono text-sm font-semibold text-fg tabular-nums">
              {bid.asked_price_sats.toLocaleString()}
            </span>
            <span className="font-mono text-xs text-muted ml-1">sats</span>
          </div>

          {/* Ensemble pill */}
          <div className="flex-1">
            <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-mono tracking-widest border border-accent/30 text-amber bg-accent/5">
              ensemble
            </span>
          </div>

          {/* Code hash */}
          <div className="w-32 flex-shrink-0 hidden lg:block">
            <span
              className="font-mono text-xs text-muted/60 cursor-default"
              title={bid.code_hash}
              aria-label={`Code hash: ${bid.code_hash}`}
            >
              {truncateHash(bid.code_hash)}
            </span>
          </div>

          {/* Bid status badge */}
          <div className="w-20 flex-shrink-0 hidden sm:block">
            <StatusBadge variant={bid.status} />
          </div>

          {/* Accept button */}
          <div className="w-24 flex-shrink-0 flex justify-end">
            {canAccept && onAccept && (
              <button
                onClick={() => onAccept(bid.id)}
                className="px-3 py-1.5 bg-accent text-fg text-xs font-mono font-semibold tracking-wide hover:bg-accent/80 active:bg-accent/70 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-label={`Accept bid from ${truncatePubkey(bid.bidder_pubkey)} for ${bid.asked_price_sats} sats`}
              >
                ACCEPT
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
