import { AnimatedCount } from "./AnimatedCount";

interface StatsCardProps {
  label: string;
  value: number;
  accent?: boolean;
}

export function StatsCard({ label, value, accent = false }: StatsCardProps) {
  return (
    <div className={`border border-[--border] p-6 bg-[--surface] ${accent ? "border-l-4 border-l-[--accent]" : ""}`}>
      <p className="text-xs font-mono uppercase tracking-widest text-[--text-muted] mb-2">
        {label}
      </p>
      <p className="text-4xl font-display font-bold text-[--text]">
        <AnimatedCount value={value} />
      </p>
    </div>
  );
}
