"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { StatsCard } from "@/components/StatsCard";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";
import { getProjects, getTasks } from "@/lib/storage";
import type { Project, Task } from "@/lib/types";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProjects(getProjects());
    setTasks(getTasks());
    setLoaded(true);
  }, []);

  const activeProjects = projects.filter((p) => p.status === "active").length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const blockedTasks = tasks.filter((t) => t.status === "blocked").length;
  const inProgress = tasks.filter((t) => t.status === "in-progress").length;

  const recentProjects = [...projects]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4);

  return (
    <div className="min-h-screen flex flex-col">
      <KeyboardShortcuts />
      <ShortcutsHelp />
      <Header />
      <main id="main-content" className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="font-display font-bold text-3xl text-[--text] mb-1">Dashboard</h1>
          <p className="text-sm text-[--text-muted] font-mono">
            Press <kbd className="px-1 border border-[--border]">?</kbd> for shortcuts
          </p>
        </div>

        {!loaded ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="border border-[--border] p-6 h-28 bg-[--surface] animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10 stagger">
              <StatsCard label="Total Projects" value={projects.length} />
              <StatsCard label="Active" value={activeProjects} accent />
              <StatsCard label="In Progress" value={inProgress} />
              <StatsCard label="Blocked" value={blockedTasks} />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display font-semibold text-[--text]">Recent Projects</h2>
                  <Link href="/projects" className="text-xs text-[--accent] font-mono hover:underline">
                    View all →
                  </Link>
                </div>
                <div className="space-y-2 stagger">
                  {recentProjects.map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex items-center justify-between px-4 py-3 border border-[--border] bg-[--surface] hover:border-[--accent] transition-colors"
                    >
                      <span className="text-sm text-[--text] font-medium">{p.name}</span>
                      <span className="font-mono text-xs text-[--text-muted]">{p.status}</span>
                    </Link>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="font-display font-semibold text-[--text] mb-3">Task Overview</h2>
                <div className="border border-[--border] bg-[--surface] p-4 space-y-3">
                  {(["todo", "in-progress", "done", "blocked"] as const).map((status) => {
                    const count = tasks.filter((t) => t.status === status).length;
                    const pct = tasks.length > 0 ? (count / tasks.length) * 100 : 0;
                    return (
                      <div key={status} className="flex items-center gap-3">
                        <span className="font-mono text-xs text-[--text-muted] w-20 shrink-0">{status}</span>
                        <div className="flex-1 h-1.5 bg-[--border]">
                          <div
                            className="h-full bg-[--accent] transition-all duration-700"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-[--text-muted] w-6 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex gap-2">
                  <Link
                    href="/stats"
                    className="text-xs font-mono text-[--accent] hover:underline"
                  >
                    Full stats →
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
