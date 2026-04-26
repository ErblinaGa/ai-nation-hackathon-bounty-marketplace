import { describe, it, expect } from "vitest";
import { sortTasks, sortProjects } from "@/lib/sort";
import type { Task, Project } from "@/lib/types";

const tasks: Task[] = [
  { id: "1", projectId: "p", title: "Charlie", description: "", status: "done", priority: "low", tags: [], assignee: "", dueDate: null, createdAt: "2024-01-03T00:00:00Z", updatedAt: "2024-01-03T00:00:00Z" },
  { id: "2", projectId: "p", title: "Alice", description: "", status: "todo", priority: "high", tags: [], assignee: "", dueDate: null, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" },
  { id: "3", projectId: "p", title: "Bob", description: "", status: "blocked", priority: "medium", tags: [], assignee: "", dueDate: null, createdAt: "2024-01-02T00:00:00Z", updatedAt: "2024-01-02T00:00:00Z" },
];

describe("sortTasks by name", () => {
  it("sorts ascending", () => {
    const sorted = sortTasks(tasks, { field: "name", direction: "asc" });
    expect(sorted.map((t) => t.title)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("sorts descending", () => {
    const sorted = sortTasks(tasks, { field: "name", direction: "desc" });
    expect(sorted.map((t) => t.title)).toEqual(["Charlie", "Bob", "Alice"]);
  });
});

describe("sortTasks by priority", () => {
  it("sorts high → low ascending", () => {
    const sorted = sortTasks(tasks, { field: "priority", direction: "asc" });
    expect(sorted[0].priority).toBe("high");
    expect(sorted[2].priority).toBe("low");
  });
});

describe("sortTasks by createdAt", () => {
  it("sorts oldest first ascending", () => {
    const sorted = sortTasks(tasks, { field: "createdAt", direction: "asc" });
    expect(sorted[0].id).toBe("2");
    expect(sorted[2].id).toBe("1");
  });
});

describe("sortProjects by name", () => {
  const projects: Project[] = [
    { id: "1", name: "Zebra", description: "", status: "active", tags: [], createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" },
    { id: "2", name: "Apple", description: "", status: "archived", tags: [], createdAt: "2024-01-02T00:00:00Z", updatedAt: "2024-01-02T00:00:00Z" },
  ];

  it("sorts ascending", () => {
    const sorted = sortProjects(projects, { field: "name", direction: "asc" });
    expect(sorted[0].name).toBe("Apple");
  });
});
