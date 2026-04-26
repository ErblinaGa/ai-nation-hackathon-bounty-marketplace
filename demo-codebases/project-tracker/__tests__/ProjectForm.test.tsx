import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProjectForm } from "@/components/projects/ProjectForm";

describe("ProjectForm", () => {
  it("renders name, description, and status fields", () => {
    render(<ProjectForm onSave={vi.fn()} />);
    expect(screen.getByLabelText(/project name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
  });

  it("shows validation error for short name", async () => {
    render(<ProjectForm onSave={vi.fn()} />);
    const nameInput = screen.getByLabelText(/project name/i);
    fireEvent.change(nameInput, { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: /save project/i }));
    expect(await screen.findByText(/at least 2 characters/i)).toBeInTheDocument();
  });

  it("calls onSave with correct data on valid submit", async () => {
    const onSave = vi.fn();
    render(<ProjectForm onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(/project name/i), {
      target: { value: "My New Project" },
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "A description" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save project/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: "My New Project", description: "A description" })
    );
  });

  it("calls onCancel when cancel clicked", () => {
    const onCancel = vi.fn();
    render(<ProjectForm onSave={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("pre-fills fields from initial prop", () => {
    render(
      <ProjectForm
        initial={{ name: "Existing", description: "Old desc", status: "archived" }}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/project name/i)).toHaveValue("Existing");
    expect(screen.getByLabelText(/description/i)).toHaveValue("Old desc");
  });
});
