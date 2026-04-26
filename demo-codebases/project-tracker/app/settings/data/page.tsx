"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { exportRaw, clearAll } from "@/lib/storage";
import { tasksToCSV, projectsToCSV } from "@/lib/csv";
import { useToast } from "@/components/ui/ToastProvider";
import { useRouter } from "next/navigation";

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function DataPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const [clearing, setClearing] = useState(false);

  function handleExportTasks() {
    const { projects, tasks } = exportRaw();
    downloadCSV(tasksToCSV(tasks, projects), "project-tracker-tasks.csv");
    showToast("Tasks exported as CSV", "success");
  }

  function handleExportProjects() {
    const { projects } = exportRaw();
    downloadCSV(projectsToCSV(projects), "project-tracker-projects.csv");
    showToast("Projects exported as CSV", "success");
  }

  function handleClear() {
    if (!confirm("Clear all data? This cannot be undone.")) return;
    setClearing(true);
    clearAll();
    showToast("All data cleared", "info");
    // Reload to reseed
    setTimeout(() => { router.push("/"); }, 500);
  }

  return (
    <div>
      <h1 className="font-display font-bold text-2xl text-[--text] mb-6">Data</h1>

      <section className="mb-8">
        <h2 className="font-mono text-xs uppercase tracking-widest text-[--text-muted] mb-3">Export</h2>
        <div className="border border-[--border] bg-[--surface] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[--text]">Export tasks as CSV</p>
              <p className="text-xs text-[--text-muted]">All tasks with project names, status, priority</p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleExportTasks} aria-label="Export tasks CSV">
              Export
            </Button>
          </div>
          <div className="flex items-center justify-between border-t border-[--border] pt-3">
            <div>
              <p className="text-sm font-medium text-[--text]">Export projects as CSV</p>
              <p className="text-xs text-[--text-muted]">All projects with metadata</p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleExportProjects} aria-label="Export projects CSV">
              Export
            </Button>
          </div>
          {/* No CSV import — bounty gap #3 */}
          <p className="text-xs text-[--text-muted] font-mono pt-1">CSV import not yet supported</p>
        </div>
      </section>

      <section>
        <h2 className="font-mono text-xs uppercase tracking-widest text-[--text-muted] mb-3">Danger Zone</h2>
        <div className="border border-red-200 dark:border-red-900 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[--text]">Clear all data</p>
              <p className="text-xs text-[--text-muted]">Removes all projects and tasks. Seed data will reload.</p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={handleClear}
              disabled={clearing}
              aria-label="Clear all data"
            >
              Clear
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
