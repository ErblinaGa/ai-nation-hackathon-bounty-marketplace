import Link from "next/link";
import type { Project, Task } from "@/lib/types";
import { TagBadge } from "@/components/tags/TagBadge";

interface ProjectCardProps {
  project: Project;
  taskCount: number;
  doneCount: number;
}

const statusColor: Record<string, string> = {
  active: "text-green-600 border-green-300 dark:border-green-700 dark:text-green-400",
  archived: "text-zinc-500 border-zinc-300 dark:border-zinc-600",
  completed: "text-blue-600 border-blue-300 dark:border-blue-700 dark:text-blue-400",
};

export function ProjectCard({ project, taskCount, doneCount }: ProjectCardProps) {
  const pct = taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="block border border-[--border] bg-[--surface] p-5 hover:border-[--accent] transition-colors group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-display font-semibold text-[--text] group-hover:text-[--accent] transition-colors truncate">
          {project.name}
        </h3>
        <span className={`shrink-0 text-xs font-mono border px-1.5 py-0.5 ${statusColor[project.status]}`}>
          {project.status}
        </span>
      </div>
      <p className="text-sm text-[--text-muted] line-clamp-2 mb-3">{project.description}</p>
      <div className="flex flex-wrap gap-1 mb-3">
        {project.tags.map((tag) => (
          <TagBadge key={tag.id} tag={tag} />
        ))}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1 bg-[--border]">
          <div
            className="h-full bg-[--accent] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-mono text-xs text-[--text-muted] shrink-0">
          {doneCount}/{taskCount}
        </span>
      </div>
    </Link>
  );
}
