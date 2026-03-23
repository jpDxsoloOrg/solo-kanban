"use server";

import { prisma } from "@/lib/prisma";

export async function toggleSubtask(subtaskId: string, completed: boolean) {
  return prisma.subtask.update({
    where: { id: subtaskId },
    data: { completed },
  });
}

export async function addSubtask(issueId: string, title: string, order: number) {
  return prisma.subtask.create({
    data: {
      title,
      order,
      issueId,
    },
  });
}

export async function deleteSubtask(subtaskId: string) {
  return prisma.subtask.delete({
    where: { id: subtaskId },
  });
}