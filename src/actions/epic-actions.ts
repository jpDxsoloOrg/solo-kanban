"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createEpic(projectId: string, name: string, color: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Epic name can't be empty.");
  const epic = await prisma.epic.create({
    data: { name: trimmed, color, projectId },
  });

  // Every page of the project lists epics (sidebar, board filters, issue editor).
  revalidatePath(`/projects/${projectId}`, "layout");
  return epic;
}

export async function updateEpic(epicId: string, data: { name?: string; color?: string }) {
  const epic = await prisma.epic.update({
    where: { id: epicId },
    data,
  });

  revalidatePath(`/projects/${epic.projectId}/board`);
  return epic;
}

export async function deleteEpic(epicId: string) {
  const epic = await prisma.epic.delete({
    where: { id: epicId },
  });

  // Issues linked to this epic get epicId set to null (onDelete: SetNull in schema)
  revalidatePath(`/projects/${epic.projectId}/board`);
}