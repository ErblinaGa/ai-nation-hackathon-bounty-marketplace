"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { TaskList } from "@/components/tasks/TaskList";
import { Modal } from "@/components/ui/Modal";
import { TaskForm } from "@/components/tasks/TaskForm";
import { Button } from "@/components/ui/Button";
import { TagBadge } from "@/components/tags/TagBadge";
import { getProject, getTasks, saveTask, deleteTask, deleteProject } from "@/lib/storage";
import { useToast } from "@/components/ui/ToastProvider";
import type { Project, Task } from "@/lib/types";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [loaded, setLoaded] = useState(false);

  function load() {
    setProject(getProject(id));
    setTasks(getTasks(id));
    setLoaded(true);
  }

  useEffect(() => { load(); }, [id]);

  function handleAddTask(data: Omit<Task, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const task: Task = { ...data, id: `task-${Date.now()}`, createdAt: now, updatedAt: now };
    saveTask(task);
    setTasks((prev) => [...prev, task]);
    setShowTaskModal(false);
    showToast("Task created", "success");
  }

  function handleDeleteTask(taskId: string) {
    deleteTask(taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    showToast("Task deleted", "info");
  }

  function handleDeleteProject() {
    if (!project) return;
    if (!confirm(`Delete project "${project.name}" and all its tasks?`)) return;
    deleteProject(id);
    showToast(`Project "${project.name}" deleted`, "info");
    router.push("/projects");
  }

  if (!loaded) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main id="main-content" className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
          <div className="h-8 w-48 bg-[--border] animate-pulse mb-4" />
          <div className="h-32 bg-[--surface] border border-[--border] animate-pulse" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main id="main-content" className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full text-center">
          <p className="font-mono text-[--text-muted] mt-16">Project not found</p>
          <Link href="/projects" className="text-sm text-[--accent] hover:underline mt-4 block">
            ← Back to projects
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main id="main-content" className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
        <Link href="/projects" className="font-mono text-xs text-[--text-muted] hover:text-[--accent] transition-colors">
          ← Projects
        </Link>
        <div className="mt-3 mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="font-display font-bold text-3xl text-[--text]">{project.name}</h1>
              <span className="font-mono text-xs border border-[--border] px-2 py-0.5 text-[--text-muted]">
                {project.status}
              </span>
            </div>
            <p className="text-sm text-[--text-muted] mb-2">{project.description}</p>
            <div className="flex flex-wrap gap-1">
              {project.tags.map((tag) => <TagBadge key={tag.id} tag={tag} />)}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowTaskModal(true)}
              aria-label="Add task"
            >
              + Task
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDeleteProject}
              aria-label="Delete project"
            >
              Delete
            </Button>
          </div>
        </div>

        <div className="border-t border-[--border] pt-6">
          <h2 className="font-display font-semibold text-[--text] mb-4">
            Tasks ({tasks.length})
          </h2>
          <TaskList tasks={tasks} projectId={id} onDelete={handleDeleteTask} />
        </div>
      </main>

      <Modal
        open={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        title="New Task"
      >
        <TaskForm
          projectId={id}
          onSave={handleAddTask}
          onCancel={() => setShowTaskModal(false)}
        />
      </Modal>

      <Footer />
    </div>
  );
}
