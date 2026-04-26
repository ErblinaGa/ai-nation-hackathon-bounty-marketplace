"use client";

import { useState } from "react";

interface WalletTransaction {
  id: string;
  amount_sats: number;
  type: "SEED" | "HOLD" | "SETTLE" | "CANCEL" | "BURN";
  reason: string | null;
  created_at: string;
}

interface WalletRowProps {
  pubkey: string;
  balance_sats: number;
  locked_sats: number;
  label: string | null;
  created_at: string;
  recent_transactions: WalletTransaction[];
}

const TX_TYPE_STYLES: Record<WalletTransaction["type"], string> = {
  SEED:   "text-[#4CAF7D]",
  HOLD:   "text-[#E8A838]",
  SETTLE: "text-[#4CAF7D]",
  CANCEL: "text-[#CF4444]",
  BURN:   "text-fg/40",
};

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function truncatePubkey(pk: string): string {
  if (pk.length <= 14) return pk;
  return `${pk.slice(0, 8)}…${pk.slice(-6)}`;
}

export default function WalletRow({
  pubkey,
  balance_sats,
  locked_sats,
  label,
  recent_transactions,
}: WalletRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Main row */}
      <button
        type="button"
        className="w-full text-left grid grid-cols-[1fr_auto_auto_auto] gap-px bg-border"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`Toggle transactions for wallet ${label ?? pubkey}`}
      >
        {/* Pubkey + label */}
        <div className="bg-bg px-4 py-3 flex items-center gap-3 min-w-0">
          <span
            className="font-mono text-xs text-fg truncate"
            title={pubkey}
          >
            {truncatePubkey(pubkey)}
          </span>
          {label && (
            <span className="text-[10px] font-mono tracking-widest uppercase text-muted border border-border px-1.5 py-0.5 shrink-0">
              {label}
            </span>
          )}
        </div>

        {/* Balance */}
        <div className="bg-bg px-4 py-3 flex flex-col items-end justify-center min-w-[110px]">
          <span className="text-[10px] font-mono tracking-widest uppercase text-muted mb-0.5">
            Balance
          </span>
          <span className="font-mono font-semibold text-lg text-accent tabular-nums">
            {balance_sats.toLocaleString()}
            <span className="text-xs text-muted font-normal ml-1">sats</span>
          </span>
        </div>

        {/* Locked */}
        <div className="bg-bg px-4 py-3 flex flex-col items-end justify-center min-w-[100px]">
          <span className="text-[10px] font-mono tracking-widest uppercase text-muted mb-0.5">
            Locked
          </span>
          <span className="font-mono text-sm text-fg/50 tabular-nums">
            {locked_sats.toLocaleString()}
            <span className="text-xs ml-1">sats</span>
          </span>
        </div>

        {/* Expand toggle */}
        <div className="bg-bg px-4 py-3 flex items-center justify-center">
          <span
            className="font-mono text-[10px] tracking-widest uppercase text-muted"
            aria-hidden="true"
          >
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {/* Expanded transactions */}
      {expanded && (
        <div className="bg-bg/50 border-t border-border">
          {recent_transactions.length === 0 ? (
            <p className="px-4 py-3 text-xs font-mono text-muted">
              No recent transactions.
            </p>
          ) : (
            <table className="w-full text-xs font-mono" aria-label={`Recent transactions for ${label ?? pubkey}`}>
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-[10px] tracking-widest uppercase text-muted font-normal">
                    Time
                  </th>
                  <th className="text-left px-4 py-2 text-[10px] tracking-widest uppercase text-muted font-normal">
                    Type
                  </th>
                  <th className="text-right px-4 py-2 text-[10px] tracking-widest uppercase text-muted font-normal">
                    Amount
                  </th>
                  <th className="text-left px-4 py-2 text-[10px] tracking-widest uppercase text-muted font-normal">
                    Reason
                  </th>
                </tr>
              </thead>
              <tbody>
                {recent_transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-border/40 last:border-b-0">
                    <td className="px-4 py-2 text-muted whitespace-nowrap">
                      {formatTs(tx.created_at)}
                    </td>
                    <td className={`px-4 py-2 tracking-widest ${TX_TYPE_STYLES[tx.type] ?? "text-fg"}`}>
                      {tx.type}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <span className={tx.amount_sats >= 0 ? "text-[#4CAF7D]" : "text-[#CF4444]"}>
                        {tx.amount_sats >= 0 ? "+" : ""}
                        {tx.amount_sats.toLocaleString()}
                      </span>
                      <span className="text-muted ml-1">sats</span>
                    </td>
                    <td className="px-4 py-2 text-muted truncate max-w-[240px]" title={tx.reason ?? ""}>
                      {tx.reason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
