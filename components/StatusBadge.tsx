import type { BidStatus, BountyStatus, TestStatus } from "@/lib/types";

type BadgeVariant = BidStatus | BountyStatus | TestStatus;

const VARIANT_STYLES: Record<string, string> = {
  PASS: "bg-success/10 text-success border border-success/30",
  FAIL: "bg-danger/10 text-danger border border-danger/30",
  PENDING: "bg-accent/10 text-amber border border-accent/30",
  OPEN: "bg-fg/5 text-fg border border-fg/20",
  SETTLED: "bg-success/10 text-success border border-success/30",
  EXPIRED: "bg-muted/10 text-muted border border-muted/30",
  WON: "bg-accent/15 text-amber border border-accent/40",
  LOST: "bg-muted/10 text-muted border border-muted/30",
  REFUNDED: "bg-muted/10 text-muted border border-muted/30",
  AWAITING_STAKE: "bg-accent/10 text-amber border border-accent/30",
  AWAITING_STAKE_PAYMENT: "bg-accent/10 text-amber border border-accent/30",
  CANCELED: "bg-danger/10 text-danger border border-danger/30",
};

const VARIANT_LABELS: Record<string, string> = {
  AWAITING_STAKE: "AWAITING",
  AWAITING_STAKE_PAYMENT: "AWAITING",
};

interface StatusBadgeProps {
  variant: BadgeVariant;
  className?: string;
}

export default function StatusBadge({ variant, className = "" }: StatusBadgeProps) {
  const styles = VARIANT_STYLES[variant] ?? "bg-muted/10 text-muted border border-muted/30";
  const label = VARIANT_LABELS[variant] ?? variant;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono font-medium tracking-widest rounded-sm ${styles} ${className}`}
    >
      {label}
    </span>
  );
}
