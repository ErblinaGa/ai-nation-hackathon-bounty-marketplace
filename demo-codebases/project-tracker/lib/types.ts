export type TaskStatus = "todo" | "in-progress" | "done" | "blocked";
export type TaskPriority = "low" | "medium" | "high";
export type ProjectStatus = "active" | "archived" | "completed";

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: Tag[];
  assignee: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  tags: Tag[];
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarInitials: string;
}

export interface Session {
  userId: string;
  user: User;
  expiresAt: string;
}

export interface StatsSnapshot {
  totalProjects: number;
  activeProjects: number;
  totalTasks: number;
  completedTasks: number;
  blockedTasks: number;
  tasksByStatus: Record<TaskStatus, number>;
  tasksByPriority: Record<TaskPriority, number>;
}

export type SortField = "name" | "createdAt" | "updatedAt" | "priority" | "status";
export type SortDirection = "asc" | "desc";

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

export interface FilterConfig {
  status?: TaskStatus | ProjectStatus;
  priority?: TaskPriority;
  tags?: string[];
  search?: string;
  assignee?: string;
}
