"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import { TagBadge } from "@/components/tags/TagBadge";
import { Modal } from "@/components/ui/Modal";
import { TaskForm } from "@/components/tasks/TaskForm";
import { Button } from "@/components/ui/Button";
import { getTask, getProject, saveTask, deleteTask } from "@/lib/storage";
import { useToast } from "@/components/ui/ToastProvider";
import type { Task, Project } from "@/lib/types";

export default function TaskDetailPage() {
  const { id, taskId } = useParams<{ id: string; taskId: string }>();
  const router = useRouter();
  const { showToast } = useToast();

  const [task, setTask] = useState<Task | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setTask(getTask(taskId));
    setProject(getProject(id));
    setLoaded(true);
  }, [id, taskId]);

  function handleEditSave(data: Omit<Task, "id" | "createdAt" | "updatedAt">) {
    if (!task) return;
    const updated: Task = { ...task, ...data, updatedAt: new Date().toISOString() };
    saveTask(updated);
    setTask(updated);
    setShowEditModal(false);
    showToast("Task updated", "success");
  }

  function handleDelete() {
    if (!task) return;
    if (!confirm(`Delete task "${task.title}"?`)) return;
    deleteTask(taskId);
    showToast("Task deleted", "info");
    router.push(`/projects/${id}`);
  }

  if (!loaded) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main id="main-content" className="flex-1 px-6 py-8 max-w-2xl mx-auto w-full">
          <div className="h-8 w-48 bg-[--border] animate-pulse mb-4" />
          <div className="h-48 bg-[--surface] border border-[--border] animate-pulse" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main id="main-content" className="flex-1 px-6 py-8 max-w-2xl mx-auto w-full text-center">
          <p className="font-mono text-[--text-muted] mt-16">Task not found</p>
          <Link href={`/projects/${id}`} className="text-sm text-[--accent] hover:underline mt-4 block">
            ← Back to project
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main id="main-content" className="flex-1 px-6 py-8 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-2 mb-4 font-mono text-xs text-[--text-muted]">
          <Link href="/projects" className="hover:text-[--accent] transition-colors">Projects</Link>
          <span>/</span>
          <Link href={`/projects/${id}`} className="hover:text-[--accent] transition-colors">
            {project?.name ?? id}
          </Link>
          <span>/</span>
          <span className="text-[--text]">Task</span>
        </div>

        <div className="border border-[--border] bg-[--surface] p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h1 className="font-display font-bold text-2xl text-[--text]">{task.title}</h1>
                <TaskStatusBadge status={task.status} />
              </div>
              <div className="flex flex-wrap gap-1">
                {task.tags.map((tag) => <TagBadge key={tag.id} tag={tag} />)}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="secondary" size="sm" onClick={() => setShowEditModal(true)} aria-label="Edit task">
                Edit
              </Button>
              <Button variant="danger" size="sm" onClick={handleDelete} aria-label="Delete task">
                Delete
              </Button>
            </div>
          </div>

          {task.description && (
            <p className="text-sm text-[--text-muted] mb-6 leading-relaxed">{task.description}</p>
          )}

          <dl className="grid grid-cols-2 gap-4 text-sm border-t border-[--border] pt-4">
            <div>
              <dt className="font-mono text-xs uppercase tracking-widest text-[--text-muted] mb-0.5">Priority</dt>
              <dd className="text-[--text] font-medium">{task.priority}</dd>
            </div>
            <div>
              <dt className="font-mono text-xs uppercase tracking-widest text-[--text-muted] mb-0.5">Assignee</dt>
              <dd className="text-[--text] font-medium font-mono text-sm">{task.assignee || "—"}</dd>
            </div>
            <div>
              <dt className="font-mono text-xs uppercase tracking-widest text-[--text-muted] mb-0.5">Due Date</dt>
              <dd className="text-[--text] font-medium">{task.dueDate ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-mono text-xs uppercase tracking-widest text-[--text-muted] mb-0.5">Created</dt>
              <dd className="text-[--text] font-mono text-xs">{new Date(task.createdAt).toLocaleDateString()}</dd>
            </div>
          </dl>
        </div>
      </main>

      <Modal open={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Task">
        <TaskForm
          projectId={id}
          initial={task}
          onSave={handleEditSave}
          onCancel={() => setShowEditModal(false)}
        />
      </Modal>

      <Footer />
    </div>
  );
}
