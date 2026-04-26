import { NextRequest } from "next/server";
import { getProjects, saveProject } from "@/lib/storage";
import { validateProject } from "@/lib/validation";
import { badRequest } from "@/lib/api/errors";
import type { Project } from "@/lib/types";

export function GET() {
  const projects = getProjects();
  return Response.json(projects);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as unknown;
  const result = validateProject(body);
  if (!result.valid) {
    return badRequest(Object.values(result.errors).join(", "));
  }
  const data = body as Omit<Project, "id" | "createdAt" | "updatedAt">;
  const now = new Date().toISOString();
  const project: Project = {
    ...data,
    id: `proj-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  };
  saveProject(project);
  return Response.json(project, { status: 201 });
}
