"use client";

import { useEffect, useState } from "react";
import type { BountyListItem } from "@/lib/types";

interface StatsState {
  activeBounties: number;
  totalSettledSats: number;
  avgSettlementTime: number | null;
}

export default function LiveStats() {
  const [stats, setStats] = useState<StatsState>({
    activeBounties: 0,
    totalSettledSats: 0,
    avgSettlementTime: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function fetchStats() {
    try {
      const res = await fetch("/api/bounties?status=OPEN");
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as { bounties: BountyListItem[] };
      setStats({
        activeBounties: data.bounties.length,
        // Derive settled sats from visible bounties (in demo context, use bid data)
        totalSettledSats: data.bounties.reduce(
          (sum, b) => sum + (b.passing_bid_count > 0 ? b.max_bounty_sats : 0),
          0
        ),
        avgSettlementTime: null,
      });
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 5000);
    return () => clearInterval(id);
  }, []);

  const statItems = [
    {
      label: "Active Bounties",
      value: stats.activeBounties,
      suffix: "",
      format: (v: number) => v.toString(),
    },
    {
      label: "Total Locked Sats",
      value: stats.totalSettledSats,
      suffix: " sats",
      format: (v: number) => v.toLocaleString(),
    },
    {
      label: "Avg Settlement",
      value: stats.avgSettlementTime,
      suffix: "s",
      format: (v: number | null) => (v === null ? "—" : `${v}`),
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-px border border-border bg-border">
      {statItems.map((item, i) => (
        <div key={i} className="bg-bg px-8 py-8">
          <div
            className="font-display font-bold text-5xl tracking-tightest text-fg tabular-nums mb-2"
            aria-label={item.label}
          >
            {loading ? (
              <span className="inline-block w-20 h-10 bg-fg/5 animate-pulse" />
            ) : error ? (
              <span className="text-danger text-2xl">—</span>
            ) : (
              <>
                {item.format(item.value as number)}
                {item.suffix && item.value !== null && (
                  <span className="text-xl text-muted font-normal ml-1">{item.suffix}</span>
                )}
              </>
            )}
          </div>
          <div className="text-xs font-mono text-muted tracking-widest uppercase">
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}
