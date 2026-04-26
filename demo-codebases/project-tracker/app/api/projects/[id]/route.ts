import { NextRequest } from "next/server";
import { getProject, saveProject, deleteProject } from "@/lib/storage";
import { validateProject } from "@/lib/validation";
import { notFound, badRequest } from "@/lib/api/errors";
import type { Project } from "@/lib/types";

interface Params {
  params: { id: string };
}

export function GET(_req: NextRequest, { params }: Params) {
  const project = getProject(params.id);
  if (!project) return notFound();
  return Response.json(project);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const project = getProject(params.id);
  if (!project) return notFound();

  const body = await req.json() as unknown;
  const result = validateProject(body);
  if (!result.valid) return badRequest(Object.values(result.errors).join(", "));

  const data = body as Partial<Project>;
  const updated: Project = {
    ...project,
    ...data,
    id: project.id,
    createdAt: project.createdAt,
    updatedAt: new Date().toISOString(),
  };
  saveProject(updated);
  return Response.json(updated);
}

export function DELETE(_req: NextRequest, { params }: Params) {
  const project = getProject(params.id);
  if (!project) return notFound();
  deleteProject(params.id);
  return new Response(null, { status: 204 });
}
