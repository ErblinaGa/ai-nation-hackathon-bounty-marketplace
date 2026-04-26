import type { TaskType } from "@/lib/types";

interface TaskTypeBadgeProps {
  taskType: TaskType;
  className?: string;
}

const STYLES: Record<TaskType, string> = {
  snippet: "bg-fg/[0.06] text-fg/70 border border-fg/15",
  codebase: "bg-accent/10 text-amber border border-accent/30",
  bug_bounty: "bg-danger/10 text-danger border border-danger/30",
};

const LABELS: Record<TaskType, string> = {
  snippet: "snippet",
  codebase: "codebase",
  bug_bounty: "bug-bounty",
};

export default function TaskTypeBadge({ taskType, className = "" }: TaskTypeBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono font-medium tracking-widest ${STYLES[taskType]} ${className}`}
      aria-label={`Task type: ${LABELS[taskType]}`}
    >
      {LABELS[taskType]}
    </span>
  );
}
