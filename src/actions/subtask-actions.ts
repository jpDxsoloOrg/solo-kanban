"use server";

import { prisma } from "@/lib/prisma";

/** Same cap as the public API (MAX_SUBTASK_DESCRIPTION_LENGTH). */
const MAX_SUBTASK_DESCRIPTION_LENGTH = 20_000;

/** Trims a description; empty becomes null. Rejects over-long text. */
function normalizeDescription(description: string | null | undefined): string | null {
  const trimmed = description?.trim() ?? "";
  if (trimmed.length > MAX_SUBTASK_DESCRIPTION_LENGTH) {
    throw new Error(`Description must be ${MAX_SUBTASK_DESCRIPTION_LENGTH} characters or fewer.`);
  }
  return trimmed || null;
}

export async function toggleSubtask(subtaskId: string, completed: boolean) {
  return prisma.subtask.update({
    where: { id: subtaskId },
    data: { completed },
  });
}

export async function addSubtask(issueId: string, title: string, order: number, description?: string | null) {
  return prisma.subtask.create({
    data: {
      title,
      description: normalizeDescription(description),
      order,
      issueId,
    },
  });
}

export async function updateSubtaskDescription(subtaskId: string, description: string | null) {
  return prisma.subtask.update({
    where: { id: subtaskId },
    data: { description: normalizeDescription(description) },
  });
}

export async function deleteSubtask(subtaskId: string) {
  return prisma.subtask.delete({
    where: { id: subtaskId },
  });
}
