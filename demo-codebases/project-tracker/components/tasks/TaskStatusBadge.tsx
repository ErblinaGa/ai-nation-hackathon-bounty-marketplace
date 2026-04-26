import type { TaskStatus } from "@/lib/types";

interface Props {
  status: TaskStatus;
}

const classes: Record<TaskStatus, string> = {
  todo: "border-zinc-300 text-zinc-500 dark:border-zinc-600 dark:text-zinc-400",
  "in-progress": "border-blue-400 text-blue-600 dark:border-blue-500 dark:text-blue-400",
  done: "border-green-400 text-green-600 dark:border-green-500 dark:text-green-400",
  blocked: "border-red-400 text-red-600 dark:border-red-500 dark:text-red-400",
};

const labels: Record<TaskStatus, string> = {
  todo: "To do",
  "in-progress": "In Progress",
  done: "Done",
  blocked: "Blocked",
};

export function TaskStatusBadge({ status }: Props) {
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-mono border ${classes[status]}`}>
      {labels[status]}
    </span>
  );
}
