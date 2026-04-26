import type { Project, Task } from "./types";
import { SEED_PROJECTS, SEED_TASKS } from "./seed";

const PROJECTS_KEY = "pt_projects";
const TASKS_KEY = "pt_tasks";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readJSON<T>(key: string): T | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJSON<T>(key: string, data: T): void {
  if (!isBrowser()) return;
  localStorage.setItem(key, JSON.stringify(data));
}

// Seed on first load — runs once per browser session
function ensureSeeded(): void {
  if (!isBrowser()) return;
  if (localStorage.getItem(PROJECTS_KEY) === null) {
    writeJSON(PROJECTS_KEY, SEED_PROJECTS);
    writeJSON(TASKS_KEY, SEED_TASKS);
  }
}

// Projects
export function getProjects(): Project[] {
  ensureSeeded();
  return readJSON<Project[]>(PROJECTS_KEY) ?? [];
}

export function getProject(id: string): Project | null {
  return getProjects().find((p) => p.id === id) ?? null;
}

export function saveProject(project: Project): void {
  const projects = getProjects();
  const idx = projects.findIndex((p) => p.id === project.id);
  if (idx >= 0) {
    projects[idx] = project;
  } else {
    projects.push(project);
  }
  writeJSON(PROJECTS_KEY, projects);
}

export function deleteProject(id: string): void {
  const projects = getProjects().filter((p) => p.id !== id);
  writeJSON(PROJECTS_KEY, projects);
  // Cascade delete tasks
  const tasks = getTasks().filter((t) => t.projectId !== id);
  writeJSON(TASKS_KEY, tasks);
}

// Tasks
export function getTasks(projectId?: string): Task[] {
  ensureSeeded();
  const all = readJSON<Task[]>(TASKS_KEY) ?? [];
  return projectId ? all.filter((t) => t.projectId === projectId) : all;
}

export function getTask(id: string): Task | null {
  return getTasks().find((t) => t.id === id) ?? null;
}

export function saveTask(task: Task): void {
  const tasks = getTasks();
  const idx = tasks.findIndex((t) => t.id === task.id);
  if (idx >= 0) {
    tasks[idx] = task;
  } else {
    tasks.push(task);
  }
  writeJSON(TASKS_KEY, tasks);
}

export function deleteTask(id: string): void {
  const tasks = getTasks().filter((t) => t.id !== id);
  writeJSON(TASKS_KEY, tasks);
}

export function clearAll(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(PROJECTS_KEY);
  localStorage.removeItem(TASKS_KEY);
}

export function exportRaw(): { projects: Project[]; tasks: Task[] } {
  return { projects: getProjects(), tasks: getTasks() };
}
