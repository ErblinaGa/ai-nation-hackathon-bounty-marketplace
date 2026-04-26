import { describe, it, expect } from "vitest";
import { searchProjects, searchTasks } from "@/lib/search";
import type { Project, Task } from "@/lib/types";

const projects: Project[] = [
  { id: "1", name: "Alpha Project", description: "First project", status: "active", tags: [{ id: "t1", name: "web", color: "#f97316" }], createdAt: "", updatedAt: "" },
  { id: "2", name: "Beta Service", description: "Second backend service", status: "active", tags: [], createdAt: "", updatedAt: "" },
  { id: "3", name: "Gamma Tool", description: "Internal tooling", status: "archived", tags: [{ id: "t2", name: "internal", color: "#3b82f6" }], createdAt: "", updatedAt: "" },
];

const tasks: Task[] = [
  { id: "t1", projectId: "1", title: "Fix login bug", description: "Auth issue on mobile", status: "todo", priority: "high", tags: [], assignee: "alice@example.com", dueDate: null, createdAt: "", updatedAt: "" },
  { id: "t2", projectId: "1", title: "Add dark mode", description: "", status: "in-progress", priority: "low", tags: [{ id: "tag1", name: "ui", color: "#10b981" }], assignee: "", dueDate: null, createdAt: "", updatedAt: "" },
  { id: "t3", projectId: "2", title: "Write tests", description: "Unit and integration", status: "todo", priority: "medium", tags: [], assignee: "bob@example.com", dueDate: null, createdAt: "", updatedAt: "" },
];

describe("searchProjects", () => {
  it("returns all projects for empty query", () => {
    expect(searchProjects(projects, "")).toHaveLength(3);
  });

  it("matches by name (case-insensitive)", () => {
    expect(searchProjects(projects, "alpha")).toHaveLength(1);
    expect(searchProjects(projects, "BETA")).toHaveLength(1);
  });

  it("matches by description", () => {
    expect(searchProjects(projects, "tooling")).toHaveLength(1);
  });

  it("matches by tag name", () => {
    expect(searchProjects(projects, "internal")).toHaveLength(1);
  });

  it("returns empty for no match", () => {
    expect(searchProjects(projects, "zzznomatch")).toHaveLength(0);
  });
});

describe("searchTasks", () => {
  it("returns all tasks for empty query", () => {
    expect(searchTasks(tasks, "")).toHaveLength(3);
  });

  it("matches by title", () => {
    expect(searchTasks(tasks, "dark mode")).toHaveLength(1);
  });

  it("matches by description", () => {
    expect(searchTasks(tasks, "auth issue")).toHaveLength(1);
  });

  it("matches by assignee", () => {
    expect(searchTasks(tasks, "alice")).toHaveLength(1);
  });

  it("matches by tag name", () => {
    expect(searchTasks(tasks, "ui")).toHaveLength(1);
  });
});
