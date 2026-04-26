import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TaskItem } from "@/components/tasks/TaskItem";
import type { Task } from "@/lib/types";

const task: Task = {
  id: "task-1",
  projectId: "proj-1",
  title: "Fix the bug",
  description: "Critical production issue",
  status: "blocked",
  priority: "high",
  tags: [{ id: "t1", name: "urgent", color: "#f97316" }],
  assignee: "alice@example.com",
  dueDate: "2024-04-01",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

describe("TaskItem", () => {
  it("renders task title", () => {
    render(<TaskItem task={task} projectId="proj-1" />);
    expect(screen.getByText("Fix the bug")).toBeInTheDocument();
  });

  it("renders status badge", () => {
    render(<TaskItem task={task} projectId="proj-1" />);
    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });

  it("renders tag", () => {
    render(<TaskItem task={task} projectId="proj-1" />);
    expect(screen.getByText("urgent")).toBeInTheDocument();
  });

  it("renders assignee", () => {
    render(<TaskItem task={task} projectId="proj-1" />);
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("shows delete button when onDelete provided", () => {
    render(<TaskItem task={task} projectId="proj-1" onDelete={vi.fn()} />);
    expect(screen.getByLabelText(/delete task/i)).toBeInTheDocument();
  });

  it("does not show delete button when onDelete not provided", () => {
    render(<TaskItem task={task} projectId="proj-1" />);
    expect(screen.queryByLabelText(/delete task/i)).toBeNull();
  });

  it("calls onDelete with task id when delete clicked", () => {
    const onDelete = vi.fn();
    render(<TaskItem task={task} projectId="proj-1" onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText(/delete task/i));
    expect(onDelete).toHaveBeenCalledWith("task-1");
  });
});
