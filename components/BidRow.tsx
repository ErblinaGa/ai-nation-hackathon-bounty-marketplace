import type { PublicBid } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import EnsembleBidRow from "./EnsembleBidRow";

interface BidRowProps {
  bid: PublicBid;
  isPoster: boolean;
  onAccept?: (bidId: string) => void;
  isNew?: boolean;
  /** Pass revealed code (after accept) for diff display */
  revealedCode?: string | null;
}

function truncatePubkey(pubkey: string): string {
  if (pubkey.length <= 12) return pubkey;
  return `${pubkey.slice(0, 6)}…${pubkey.slice(-4)}`;
}

function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export default function BidRow({
  bid,
  isPoster,
  onAccept,
  isNew = false,
  revealedCode = null,
}: BidRowProps) {
  // Delegate to EnsembleBidRow if this bid used ensemble
  if (bid.ensemble_metadata) {
    return (
      <EnsembleBidRow
        bid={bid}
        isPoster={isPoster}
        onAccept={onAccept}
        isNew={isNew}
      />
    );
  }

  const canAccept = isPoster && bid.status === "PASS";
  const isDiff = bid.bid_type === "diff";

  return (
    <div
      className={`border-b border-border last:border-b-0 ${isNew ? "animate-slide-in" : ""}`}
      role="row"
    >
      <div className="flex items-center gap-4 px-4 py-3.5 hover:bg-fg/[0.02] transition-colors">
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

        {/* Metadata / bid-type indicator */}
        <div className="flex-1 flex items-center gap-4 text-xs font-mono text-muted">
          {isDiff ? (
            <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-mono tracking-widest border border-border text-muted bg-fg/[0.02]">
              diff
            </span>
          ) : (
            <>
              {bid.preview_metadata.lines != null && (
                <span title="Lines of code">
                  <span className="text-fg/50">{bid.preview_metadata.lines}</span>
                  <span className="ml-0.5">lines</span>
                </span>
              )}
              {bid.preview_metadata.runtime_ms != null && (
                <span title="Runtime in milliseconds">
                  <span className="text-fg/50">{bid.preview_metadata.runtime_ms}</span>
                  <span className="ml-0.5">ms</span>
                </span>
              )}
              {bid.preview_metadata.imports.length > 0 && (
                <span title={`Imports: ${bid.preview_metadata.imports.join(", ")}`} className="hidden md:inline">
                  <span className="text-fg/50">{bid.preview_metadata.imports.length}</span>
                  <span className="ml-0.5">imports</span>
                </span>
              )}
            </>
          )}
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

        {/* Bid-level status badge */}
        <div className="w-20 flex-shrink-0 hidden sm:block">
          <StatusBadge variant={bid.status} />
        </div>

        {/* Accept button — only for poster on PASS bids */}
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
  );
}
