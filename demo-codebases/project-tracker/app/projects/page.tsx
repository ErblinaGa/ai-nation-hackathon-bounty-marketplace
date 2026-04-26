"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProjectList } from "@/components/projects/ProjectList";
import { Button } from "@/components/ui/Button";
import { getProjects, getTasks } from "@/lib/storage";
import type { Project, Task } from "@/lib/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProjects(getProjects());
    setTasks(getTasks());
    setLoaded(true);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main id="main-content" className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display font-bold text-3xl text-[--text]">Projects</h1>
            {loaded && (
              <p className="font-mono text-sm text-[--text-muted] mt-1">
                {projects.length} project{projects.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          <Link href="/projects/new">
            <Button variant="primary" size="md" aria-label="Create new project">
              + New Project
            </Button>
          </Link>
        </div>

        {!loaded ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="border border-[--border] h-40 bg-[--surface] animate-pulse" />
            ))}
          </div>
        ) : (
          <ProjectList projects={projects} tasks={tasks} />
        )}
      </main>
      <Footer />
    </div>
  );
}
