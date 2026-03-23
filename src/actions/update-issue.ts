"use server";

import { prisma } from "@/lib/prisma";
import { IssueStatus, IssuePriority } from "@prisma/client";

interface UpdateIssueInput {
  title?: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
}

export async function updateIssue(issueId: string, data: UpdateIssueInput) {
  const updated = await prisma.issue.update({
    where: { id: issueId },
    data,
    include: {
      epic: true,
      subtasks: {
        orderBy: { order: "asc" },
      },
    },
  });

  return updated;
}