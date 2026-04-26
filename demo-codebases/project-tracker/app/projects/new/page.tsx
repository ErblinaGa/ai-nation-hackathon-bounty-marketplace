"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { saveProject } from "@/lib/storage";
import { useToast } from "@/components/ui/ToastProvider";
import type { Project } from "@/lib/types";

export default function NewProjectPage() {
  const router = useRouter();
  const { showToast } = useToast();

  function handleSave(data: Omit<Project, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const project: Project = {
      ...data,
      id: `proj-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
    };
    saveProject(project);
    showToast(`Project "${project.name}" created`, "success");
    router.push(`/projects/${project.id}`);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main id="main-content" className="flex-1 px-6 py-8 max-w-2xl mx-auto w-full">
        <div className="mb-6">
          <Link href="/projects" className="font-mono text-xs text-[--text-muted] hover:text-[--accent] transition-colors">
            ← Projects
          </Link>
          <h1 className="font-display font-bold text-3xl text-[--text] mt-2">New Project</h1>
        </div>
        <div className="border border-[--border] bg-[--surface] p-6">
          <ProjectForm
            onSave={handleSave}
            onCancel={() => router.push("/projects")}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
