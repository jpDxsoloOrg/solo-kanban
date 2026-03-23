"use server";

import { prisma } from "@/lib/prisma";

export async function getIssue(issueId: string) {
  return prisma.issue.findUnique({
    where: { id: issueId },
    include: {
      epic: true,
      subtasks: {
        orderBy: { order: "asc" },
      },
    },
  });
}