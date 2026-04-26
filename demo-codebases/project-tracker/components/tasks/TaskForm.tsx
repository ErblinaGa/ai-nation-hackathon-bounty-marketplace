"use client";

import { useState, type FormEvent } from "react";
import type { Task, TaskStatus, TaskPriority, Tag } from "@/lib/types";
import { validateTask } from "@/lib/validation";
import { TagInput } from "@/components/tags/TagInput";
import { Button } from "@/components/ui/Button";

interface TaskFormProps {
  projectId: string;
  initial?: Partial<Task>;
  onSave: (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
}

export function TaskForm({ projectId, initial, onSave, onCancel }: TaskFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? "todo");
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? "medium");
  const [assignee, setAssignee] = useState(initial?.assignee ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [tags, setTags] = useState<Tag[]>(initial?.tags ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const data = { title, description, status, priority, assignee, dueDate: dueDate || null, projectId, tags };
    const result = validateTask(data);
    if (!result.valid) { setErrors(result.errors); return; }
    onSave(data);
  }

  const field = "w-full px-3 py-2 border border-[--border] bg-transparent text-sm text-[--text] focus:outline-none focus:border-[--accent]";
  const label = "block text-xs font-mono uppercase tracking-widest text-[--text-muted] mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label className={label} htmlFor="task-title">Title</label>
        <input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}
      </div>
      <div>
        <label className={label} htmlFor="task-desc">Description</label>
        <textarea id="task-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${field} resize-none`} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="task-status">Status</label>
          <select id="task-status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className={field}>
            <option value="todo">To do</option>
            <option value="in-progress">In Progress</option>
            <option value="done">Done</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="task-priority">Priority</label>
          <select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={field}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="task-assignee">Assignee</label>
          <input id="task-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className={field} placeholder="email@..." />
        </div>
        <div>
          <label className={label} htmlFor="task-due">Due date</label>
          <input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={field} />
          {errors.dueDate && <p className="mt-1 text-xs text-red-500">{errors.dueDate}</p>}
        </div>
      </div>
      <div>
        <label className={label}>Tags</label>
        <TagInput tags={tags} onChange={setTags} />
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="submit" variant="primary" size="md" aria-label="Save task">Save</Button>
        <Button type="button" variant="secondary" size="md" onClick={onCancel} aria-label="Cancel">Cancel</Button>
      </div>
    </form>
  );
}
