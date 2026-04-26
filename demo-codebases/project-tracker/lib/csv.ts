import type { Task, Project } from "./types";

function escapeCell(value: string | null | undefined): string {
  const s = value ?? "";
  // Wrap in quotes if contains comma, quote, or newline
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cells: string[]): string {
  return cells.map(escapeCell).join(",");
}

export function tasksToCSV(tasks: Task[], projects: Project[]): string {
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));
  const headers = [
    "id",
    "project",
    "title",
    "description",
    "status",
    "priority",
    "assignee",
    "tags",
    "dueDate",
    "createdAt",
    "updatedAt",
  ];
  const lines = [headers.join(",")];

  for (const task of tasks) {
    lines.push(
      row([
        task.id,
        projectMap.get(task.projectId) ?? task.projectId,
        task.title,
        task.description,
        task.status,
        task.priority,
        task.assignee,
        task.tags.map((t) => t.name).join(";"),
        task.dueDate ?? "",
        task.createdAt,
        task.updatedAt,
      ])
    );
  }

  return lines.join("\n");
}

export function projectsToCSV(projects: Project[]): string {
  const headers = ["id", "name", "description", "status", "tags", "createdAt", "updatedAt"];
  const lines = [headers.join(",")];

  for (const p of projects) {
    lines.push(
      row([
        p.id,
        p.name,
        p.description,
        p.status,
        p.tags.map((t) => t.name).join(";"),
        p.createdAt,
        p.updatedAt,
      ])
    );
  }

  return lines.join("\n");
}
