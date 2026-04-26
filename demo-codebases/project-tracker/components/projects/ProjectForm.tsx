"use client";

import { useState, type FormEvent } from "react";
import type { Project, ProjectStatus, Tag } from "@/lib/types";
import { validateProject } from "@/lib/validation";
import { TagInput } from "@/components/tags/TagInput";
import { Button } from "@/components/ui/Button";

interface ProjectFormProps {
  initial?: Partial<Project>;
  onSave: (project: Omit<Project, "id" | "createdAt" | "updatedAt">) => void;
  onCancel?: () => void;
}

export function ProjectForm({ initial, onSave, onCancel }: ProjectFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? "active");
  const [tags, setTags] = useState<Tag[]>(initial?.tags ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const data = { name, description, status, tags };
    const result = validateProject(data);
    if (!result.valid) { setErrors(result.errors); return; }
    onSave(data);
  }

  const field = "w-full px-3 py-2 border border-[--border] bg-transparent text-sm text-[--text] focus:outline-none focus:border-[--accent]";
  const label = "block text-xs font-mono uppercase tracking-widest text-[--text-muted] mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label className={label} htmlFor="proj-name">Project name</label>
        <input
          id="proj-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={field}
          autoFocus
          aria-describedby={errors.name ? "name-error" : undefined}
        />
        {errors.name && <p id="name-error" className="mt-1 text-xs text-red-500">{errors.name}</p>}
      </div>
      <div>
        <label className={label} htmlFor="proj-desc">Description</label>
        <textarea
          id="proj-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className={`${field} resize-none`}
          aria-describedby={errors.description ? "desc-error" : undefined}
        />
        {errors.description && <p id="desc-error" className="mt-1 text-xs text-red-500">{errors.description}</p>}
      </div>
      <div>
        <label className={label} htmlFor="proj-status">Status</label>
        <select
          id="proj-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          className={field}
        >
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
        {errors.status && <p className="mt-1 text-xs text-red-500">{errors.status}</p>}
      </div>
      <div>
        <label className={label}>Tags</label>
        <TagInput tags={tags} onChange={setTags} />
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="submit" variant="primary" size="md" aria-label="Save project">Save</Button>
        {onCancel && (
          <Button type="button" variant="secondary" size="md" onClick={onCancel} aria-label="Cancel">Cancel</Button>
        )}
      </div>
    </form>
  );
}
