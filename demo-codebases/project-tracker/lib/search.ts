import type { Project, Task } from "./types";

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

export function searchProjects(projects: Project[], query: string): Project[] {
  if (!query.trim()) return projects;
  const q = normalize(query);
  return projects.filter((p) => {
    return (
      normalize(p.name).includes(q) ||
      normalize(p.description).includes(q) ||
      p.tags.some((t) => normalize(t.name).includes(q))
    );
  });
}

export function searchTasks(tasks: Task[], query: string): Task[] {
  if (!query.trim()) return tasks;
  const q = normalize(query);
  return tasks.filter((t) => {
    return (
      normalize(t.title).includes(q) ||
      normalize(t.description).includes(q) ||
      normalize(t.assignee).includes(q) ||
      t.tags.some((tag) => normalize(tag.name).includes(q))
    );
  });
}

export interface SearchResults {
  projects: Project[];
  tasks: Task[];
}

export function searchAll(
  projects: Project[],
  tasks: Task[],
  query: string
): SearchResults {
  return {
    projects: searchProjects(projects, query),
    tasks: searchTasks(tasks, query),
  };
}
