import { NextRequest } from "next/server";
import { getTasks, saveTask } from "@/lib/storage";
import { validateTask } from "@/lib/validation";
import { badRequest } from "@/lib/api/errors";
import type { Task } from "@/lib/types";

export function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined;
  const tasks = getTasks(projectId);
  return Response.json(tasks);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as unknown;
  const result = validateTask(body);
  if (!result.valid) return badRequest(Object.values(result.errors).join(", "));

  const data = body as Omit<Task, "id" | "createdAt" | "updatedAt">;
  const now = new Date().toISOString();
  const task: Task = { ...data, id: `task-${Date.now()}`, createdAt: now, updatedAt: now };
  saveTask(task);
  return Response.json(task, { status: 201 });
}
