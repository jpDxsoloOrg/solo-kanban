"use server";

import { prisma } from "@/lib/prisma";
import type { IssuePriority, IssueStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { nextOrderInColumn } from "@/lib/issue-order";

export interface CreateIssueInput {
  projectId: string;
  title: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  epicId?: string | null;
  /** Sprint to create the issue in; null/undefined puts it in the backlog. */
  sprintId?: string | null;
}

export async function createIssue({
  projectId,
  title,
  status = "OPEN",
  priority,
  epicId,
  sprintId = null,
}: CreateIssueInput) {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Issue title can't be empty.");

  const issue = await prisma.$transaction(async (tx) => {
    if (sprintId) {
      const sprint = await tx.sprint.findUnique({
        where: { id: sprintId },
        select: { projectId: true, status: true },
      });
      if (!sprint || sprint.projectId !== projectId) throw new Error("Sprint not found.");
      if (sprint.status === "COMPLETED") {
        throw new Error("Issues can't be added to a completed sprint.");
      }
    }

    // Place the new issue at the end of its column (sprint + status).
    // Queries run sequentially: a transaction holds a single connection.
    const order = await nextOrderInColumn(tx, { projectId, sprintId, status });
    const maxNumber = await tx.issue.aggregate({ where: { projectId }, _max: { number: true } });

    return tx.issue.create({
      data: {
        title: trimmed,
        status,
        order,
        number: (maxNumber._max.number ?? 0) + 1,
        projectId,
        sprintId,
        ...(priority && { priority }),
        ...(epicId && { epicId }),
      },
      include: {
        epic: true,
        subtasks: true,
        sprint: true,
        _count: { select: { comments: true } },
      },
    });
  });

  revalidatePath(`/projects/${projectId}`, "layout");
  return issue;
}
