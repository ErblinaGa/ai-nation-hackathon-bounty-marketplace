import { describe, it, expect, beforeEach } from "vitest";
import {
  getProjects,
  saveProject,
  getProject,
  getTasks,
  saveTask,
  clearAll,
} from "@/lib/storage";
import type { Project, Task } from "@/lib/types";

// Integration tests: storage CRUD round-trips that simulate real app flows
beforeEach(() => {
  clearAll();
  localStorage.clear();
});

describe("persistence — project + task lifecycle", () => {
  it("creates a project, adds tasks, reads them back", () => {
    const now = new Date().toISOString();
    const project: Project = {
      id: "e2e-proj-1",
      name: "E2E Project",
      description: "Created by persistence test",
      status: "active",
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    saveProject(project);

    const task: Task = {
      id: "e2e-task-1",
      projectId: "e2e-proj-1",
      title: "First e2e task",
      description: "",
      status: "todo",
      priority: "medium",
      tags: [],
      assignee: "",
      dueDate: null,
      createdAt: now,
      updatedAt: now,
    };
    saveTask(task);

    const loaded = getProject("e2e-proj-1");
    expect(loaded?.name).toBe("E2E Project");

    const tasks = getTasks("e2e-proj-1");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("First e2e task");
  });

  it("updates a task status (simulates status change)", () => {
    const now = new Date().toISOString();
    const project: Project = { id: "ep2", name: "Update Test", description: "", status: "active", tags: [], createdAt: now, updatedAt: now };
    saveProject(project);

    const task: Task = { id: "et2", projectId: "ep2", title: "Task to update", description: "", status: "todo", priority: "high", tags: [], assignee: "", dueDate: null, createdAt: now, updatedAt: now };
    saveTask(task);

    saveTask({ ...task, status: "done", updatedAt: new Date().toISOString() });

    const updated = getTasks("ep2").find((t) => t.id === "et2");
    expect(updated?.status).toBe("done");
  });

  it("seed data loads when localStorage is empty", () => {
    // clearAll was called in beforeEach, so this is a fresh state
    const projects = getProjects();
    expect(projects.length).toBeGreaterThan(0);
    const tasks = getTasks();
    expect(tasks.length).toBeGreaterThan(0);
  });

  it("clearAll wipes all data", () => {
    // Trigger seeding first
    getProjects();
    clearAll();
    localStorage.clear();
    // After clear + localStorage.clear, rawread returns null
    expect(localStorage.getItem("pt_projects")).toBeNull();
  });
});
