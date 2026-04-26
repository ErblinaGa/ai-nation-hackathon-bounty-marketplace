"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { StatsCard } from "@/components/StatsCard";
import { StatsBarChart } from "@/components/StatsBarChart";
import { getProjects, getTasks } from "@/lib/storage";
import type { Project, Task } from "@/lib/types";

export default function StatsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProjects(getProjects());
    setTasks(getTasks());
    setLoaded(true);
  }, []);

  const byStatus = [
    { label: "To do", value: tasks.filter((t) => t.status === "todo").length, color: "#71717a" },
    { label: "In Progress", value: tasks.filter((t) => t.status === "in-progress").length, color: "#3b82f6" },
    { label: "Done", value: tasks.filter((t) => t.status === "done").length, color: "#22c55e" },
    { label: "Blocked", value: tasks.filter((t) => t.status === "blocked").length, color: "#ef4444" },
  ];

  const byPriority = [
    { label: "Low", value: tasks.filter((t) => t.priority === "low").length, color: "#71717a" },
    { label: "Medium", value: tasks.filter((t) => t.priority === "medium").length, color: "#f59e0b" },
    { label: "High", value: tasks.filter((t) => t.priority === "high").length, color: "#f97316" },
  ];

  const byProject = projects.map((p) => ({
    label: p.name.split(" ").slice(0, 2).join(" "),
    value: tasks.filter((t) => t.projectId === p.id).length,
    color: "#f97316",
  }));

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main id="main-content" className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full">
        <h1 className="font-display font-bold text-3xl text-[--text] mb-8">Stats</h1>

        {!loaded ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="border border-[--border] h-28 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10 stagger">
              <StatsCard label="Total Projects" value={projects.length} />
              <StatsCard label="Total Tasks" value={tasks.length} />
              <StatsCard label="Completed" value={tasks.filter((t) => t.status === "done").length} accent />
              <StatsCard label="Blocked" value={tasks.filter((t) => t.status === "blocked").length} />
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <StatsBarChart data={byStatus} title="Tasks by Status" />
              <StatsBarChart data={byPriority} title="Tasks by Priority" />
              <StatsBarChart data={byProject} title="Tasks by Project" />
            </div>

            <div className="mt-8 border border-[--border] bg-[--surface] p-6">
              <p className="text-xs font-mono uppercase tracking-widest text-[--text-muted] mb-4">Project Health</p>
              <div className="space-y-3">
                {projects.map((p) => {
                  const projectTasks = tasks.filter((t) => t.projectId === p.id);
                  const done = projectTasks.filter((t) => t.status === "done").length;
                  const pct = projectTasks.length > 0 ? (done / projectTasks.length) * 100 : 0;
                  return (
                    <div key={p.id} className="flex items-center gap-4">
                      <span className="text-sm text-[--text] w-48 truncate">{p.name}</span>
                      <div className="flex-1 h-1.5 bg-[--border]">
                        <div
                          className="h-full bg-[--accent] transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-[--text-muted] w-20 text-right">
                        {done}/{projectTasks.length} done
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
