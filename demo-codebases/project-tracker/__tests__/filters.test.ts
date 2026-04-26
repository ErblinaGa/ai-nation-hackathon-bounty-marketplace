import { describe, it, expect } from "vitest";
import { filterTasks, filterProjects } from "@/lib/filters";
import type { Task, Project } from "@/lib/types";

const tasks: Task[] = [
  { id: "1", projectId: "p1", title: "A", description: "", status: "todo", priority: "high", tags: [{ id: "t1", name: "frontend", color: "#f97316" }], assignee: "alice", dueDate: null, createdAt: "", updatedAt: "" },
  { id: "2", projectId: "p1", title: "B", description: "", status: "done", priority: "low", tags: [{ id: "t2", name: "backend", color: "#3b82f6" }], assignee: "bob", dueDate: null, createdAt: "", updatedAt: "" },
  { id: "3", projectId: "p2", title: "C", description: "", status: "blocked", priority: "medium", tags: [], assignee: "alice", dueDate: null, createdAt: "", updatedAt: "" },
];

const projects: Project[] = [
  { id: "p1", name: "Alpha", description: "", status: "active", tags: [{ id: "t3", name: "web", color: "#f97316" }], createdAt: "", updatedAt: "" },
  { id: "p2", name: "Beta", description: "", status: "archived", tags: [], createdAt: "", updatedAt: "" },
];

describe("filterTasks", () => {
  it("returns all tasks with empty config", () => {
    expect(filterTasks(tasks, {})).toHaveLength(3);
  });

  it("filters by status", () => {
    expect(filterTasks(tasks, { status: "todo" })).toHaveLength(1);
    expect(filterTasks(tasks, { status: "done" })).toHaveLength(1);
  });

  it("filters by priority", () => {
    expect(filterTasks(tasks, { priority: "high" })).toHaveLength(1);
    expect(filterTasks(tasks, { priority: "low" })).toHaveLength(1);
  });

  it("filters by assignee", () => {
    expect(filterTasks(tasks, { assignee: "alice" })).toHaveLength(2);
    expect(filterTasks(tasks, { assignee: "bob" })).toHaveLength(1);
  });

  it("filters by tags", () => {
    expect(filterTasks(tasks, { tags: ["frontend"] })).toHaveLength(1);
    expect(filterTasks(tasks, { tags: ["frontend", "backend"] })).toHaveLength(2);
  });

  it("returns empty when no match", () => {
    expect(filterTasks(tasks, { status: "in-progress" })).toHaveLength(0);
  });
});

describe("filterProjects", () => {
  it("filters by status", () => {
    expect(filterProjects(projects, { status: "active" })).toHaveLength(1);
    expect(filterProjects(projects, { status: "archived" })).toHaveLength(1);
  });

  it("filters by tags", () => {
    expect(filterProjects(projects, { tags: ["web"] })).toHaveLength(1);
  });
});
