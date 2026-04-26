import { NextRequest } from "next/server";
import { getTask, saveTask, deleteTask } from "@/lib/storage";
import { validateTask } from "@/lib/validation";
import { notFound, badRequest } from "@/lib/api/errors";
import type { Task } from "@/lib/types";

interface Params {
  params: { id: string };
}

export function GET(_req: NextRequest, { params }: Params) {
  const task = getTask(params.id);
  if (!task) return notFound();
  return Response.json(task);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const task = getTask(params.id);
  if (!task) return notFound();

  const body = await req.json() as unknown;
  const result = validateTask(body);
  if (!result.valid) return badRequest(Object.values(result.errors).join(", "));

  const data = body as Partial<Task>;
  const updated: Task = { ...task, ...data, id: task.id, createdAt: task.createdAt, updatedAt: new Date().toISOString() };
  saveTask(updated);
  return Response.json(updated);
}

export function DELETE(_req: NextRequest, { params }: Params) {
  const task = getTask(params.id);
  if (!task) return notFound();
  deleteTask(params.id);
  return new Response(null, { status: 204 });
}
