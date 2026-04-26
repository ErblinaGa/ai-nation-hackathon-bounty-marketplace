// Inline validators — no zod dep, keeps bundle lean
export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateProject(data: unknown): ValidationResult {
  const errors: Record<string, string> = {};
  if (typeof data !== "object" || data === null) {
    return { valid: false, errors: { _root: "Invalid data" } };
  }
  const d = data as Record<string, unknown>;

  if (!d.name || typeof d.name !== "string" || d.name.trim().length < 2) {
    errors.name = "Name must be at least 2 characters";
  }
  if (typeof d.name === "string" && d.name.length > 80) {
    errors.name = "Name must be 80 characters or fewer";
  }
  if (d.description && typeof d.description === "string" && d.description.length > 500) {
    errors.description = "Description must be 500 characters or fewer";
  }
  const validStatuses = ["active", "archived", "completed"];
  if (d.status && !validStatuses.includes(d.status as string)) {
    errors.status = "Invalid status";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateTask(data: unknown): ValidationResult {
  const errors: Record<string, string> = {};
  if (typeof data !== "object" || data === null) {
    return { valid: false, errors: { _root: "Invalid data" } };
  }
  const d = data as Record<string, unknown>;

  if (!d.title || typeof d.title !== "string" || d.title.trim().length < 2) {
    errors.title = "Title must be at least 2 characters";
  }
  if (typeof d.title === "string" && d.title.length > 120) {
    errors.title = "Title must be 120 characters or fewer";
  }
  if (!d.projectId || typeof d.projectId !== "string") {
    errors.projectId = "Project is required";
  }
  const validStatuses = ["todo", "in-progress", "done", "blocked"];
  if (d.status && !validStatuses.includes(d.status as string)) {
    errors.status = "Invalid status";
  }
  const validPriorities = ["low", "medium", "high"];
  if (d.priority && !validPriorities.includes(d.priority as string)) {
    errors.priority = "Invalid priority";
  }
  if (d.dueDate && typeof d.dueDate === "string") {
    const parsed = Date.parse(d.dueDate);
    if (isNaN(parsed)) errors.dueDate = "Invalid date format";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateLoginForm(data: unknown): ValidationResult {
  const errors: Record<string, string> = {};
  if (typeof data !== "object" || data === null) {
    return { valid: false, errors: { _root: "Invalid data" } };
  }
  const d = data as Record<string, unknown>;

  if (!d.email || typeof d.email !== "string" || !d.email.includes("@")) {
    errors.email = "Valid email required";
  }
  if (!d.password || typeof d.password !== "string" || d.password.length < 4) {
    errors.password = "Password must be at least 4 characters";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
