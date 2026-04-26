"use client";

// CSS-only bar chart — no canvas, no charting library
interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  title?: string;
}

export function StatsBarChart({ data, title }: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="border border-[--border] bg-[--surface] p-6">
      {title && (
        <p className="text-xs font-mono uppercase tracking-widest text-[--text-muted] mb-6">
          {title}
        </p>
      )}
      <div className="flex items-end gap-4 h-32" role="img" aria-label={title ?? "Bar chart"}>
        {data.map((bar) => {
          const pct = max === 0 ? 0 : (bar.value / max) * 100;
          return (
            <div
              key={bar.label}
              className="flex flex-col items-center gap-1 flex-1"
              title={`${bar.label}: ${bar.value}`}
            >
              <span className="font-mono text-xs text-[--text-muted]">{bar.value}</span>
              <div className="w-full relative flex-1 flex items-end">
                <div
                  className="w-full transition-all duration-700 ease-out"
                  style={{
                    height: `${pct}%`,
                    minHeight: bar.value > 0 ? "4px" : "0",
                    backgroundColor: bar.color ?? "var(--accent)",
                  }}
                />
              </div>
              <span className="font-mono text-xs text-[--text-muted] truncate max-w-full">
                {bar.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
