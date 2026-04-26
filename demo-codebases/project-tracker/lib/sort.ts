import type { Project, Task, SortConfig } from "./types";

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const STATUS_ORDER_TASK = { "in-progress": 0, blocked: 1, todo: 2, done: 3 };
const STATUS_ORDER_PROJECT = { active: 0, completed: 1, archived: 2 };

export function sortTasks(tasks: Task[], config: SortConfig): Task[] {
  return [...tasks].sort((a, b) => {
    let cmp = 0;
    switch (config.field) {
      case "name":
        cmp = a.title.localeCompare(b.title);
        break;
      case "priority":
        cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        break;
      case "status":
        cmp = STATUS_ORDER_TASK[a.status] - STATUS_ORDER_TASK[b.status];
        break;
      case "createdAt":
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case "updatedAt":
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
    }
    return config.direction === "asc" ? cmp : -cmp;
  });
}

export function sortProjects(projects: Project[], config: SortConfig): Project[] {
  return [...projects].sort((a, b) => {
    let cmp = 0;
    switch (config.field) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "status":
        cmp = STATUS_ORDER_PROJECT[a.status] - STATUS_ORDER_PROJECT[b.status];
        break;
      case "createdAt":
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case "updatedAt":
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
      default:
        cmp = a.name.localeCompare(b.name);
    }
    return config.direction === "asc" ? cmp : -cmp;
  });
}
