import type { Project, Task, FilterConfig } from "./types";

export function filterTasks(tasks: Task[], config: FilterConfig): Task[] {
  return tasks.filter((task) => {
    if (config.status && task.status !== config.status) return false;
    if (config.priority && task.priority !== config.priority) return false;
    if (config.assignee && task.assignee !== config.assignee) return false;
    if (config.tags && config.tags.length > 0) {
      const taskTagNames = task.tags.map((t) => t.name);
      if (!config.tags.some((tag) => taskTagNames.includes(tag))) return false;
    }
    return true;
  });
}

export function filterProjects(projects: Project[], config: FilterConfig): Project[] {
  return projects.filter((project) => {
    if (config.status && project.status !== config.status) return false;
    if (config.tags && config.tags.length > 0) {
      const projTagNames = project.tags.map((t) => t.name);
      if (!config.tags.some((tag) => projTagNames.includes(tag))) return false;
    }
    return true;
  });
}
