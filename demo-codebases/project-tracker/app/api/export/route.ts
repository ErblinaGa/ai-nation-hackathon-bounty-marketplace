import { NextRequest } from "next/server";
import { getProjects, getTasks } from "@/lib/storage";
import { tasksToCSV, projectsToCSV } from "@/lib/csv";

export function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "tasks";
  const projects = getProjects();

  if (type === "projects") {
    const csv = projectsToCSV(projects);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=projects.csv",
      },
    });
  }

  const tasks = getTasks();
  const csv = tasksToCSV(tasks, projects);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=tasks.csv",
    },
  });
}
