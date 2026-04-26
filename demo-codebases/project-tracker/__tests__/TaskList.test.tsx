import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TaskList } from "@/components/tasks/TaskList";
import type { Task } from "@/lib/types";

const tasks: Task[] = [
  { id: "1", projectId: "p1", title: "First task", description: "", status: "todo", priority: "high", tags: [], assignee: "", dueDate: null, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" },
  { id: "2", projectId: "p1", title: "Second task", description: "Some details", status: "done", priority: "low", tags: [], assignee: "", dueDate: null, createdAt: "2024-01-02T00:00:00Z", updatedAt: "2024-01-02T00:00:00Z" },
  { id: "3", projectId: "p1", title: "Blocked task", description: "", status: "blocked", priority: "medium", tags: [], assignee: "alice", dueDate: null, createdAt: "2024-01-03T00:00:00Z", updatedAt: "2024-01-03T00:00:00Z" },
];

describe("TaskList", () => {
  it("renders all tasks", () => {
    render(<TaskList tasks={tasks} projectId="p1" />);
    expect(screen.getByText("First task")).toBeInTheDocument();
    expect(screen.getByText("Second task")).toBeInTheDocument();
    expect(screen.getByText("Blocked task")).toBeInTheDocument();
  });

  it("shows empty state when no tasks", () => {
    render(<TaskList tasks={[]} projectId="p1" />);
    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument();
  });

  it("filters tasks by search", () => {
    render(<TaskList tasks={tasks} projectId="p1" />);
    const searchInput = screen.getByPlaceholderText(/search tasks/i);
    fireEvent.change(searchInput, { target: { value: "second" } });
    expect(screen.getByText("Second task")).toBeInTheDocument();
    expect(screen.queryByText("First task")).toBeNull();
  });

  it("shows count of visible tasks", () => {
    render(<TaskList tasks={tasks} projectId="p1" />);
    expect(screen.getByText(/3 of 3 tasks/i)).toBeInTheDocument();
  });
});
