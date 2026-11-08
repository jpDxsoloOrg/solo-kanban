"use server";

import { prisma } from "@/lib/prisma";
import { IssueStatus, IssuePriority } from "@prisma/client";
import { nextOrderInColumn, normalizeColumn } from "@/lib/issue-order";

interface UpdateIssueInput {
  title?: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
}

export async function updateIssue(issueId: string, data: UpdateIssueInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.issue.findUnique({
      where: { id: issueId },
      select: {
        projectId: true,
        sprintId: true,
        status: true,
        sprint: { select: { status: true } },
      },
    });
    if (!current) throw new Error("Issue not found");

    const patch: UpdateIssueInput & { order?: number; sprintId?: string | null } = { ...data };
    const statusChanged = data.status !== undefined && data.status !== current.status;

    if (statusChanged) {
      // Reopening an issue that was archived with a completed sprint would
      // leave it invisible (completed sprints aren't on the board), so send
      // it back to the backlog instead.
      const reopenedFromHistory =
        current.sprint?.status === "COMPLETED" && data.status !== "DONE";
      const targetSprintId = reopenedFromHistory ? null : current.sprintId;

      patch.sprintId = targetSprintId;
      patch.order = await nextOrderInColumn(tx, {
        projectId: current.projectId,
        sprintId: targetSprintId,
        status: data.status!,
      });
    }

    const updated = await tx.issue.update({
      where: { id: issueId },
      data: patch,
      include: {
        epic: true,
        sprint: true,
        subtasks: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (statusChanged) {
      // Close the gap the issue left in its old column.
      await normalizeColumn(tx, {
        projectId: current.projectId,
        sprintId: current.sprintId,
        status: current.status,
      });
    }

    return updated;
  });
}
