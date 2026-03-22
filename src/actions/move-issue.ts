"use server";

import { prisma } from "@/lib/prisma";
import { IssueStatus } from "@prisma/client";

export async function moveIssue(
  issueId: string,
  newStatus: IssueStatus,
  newOrder: number
) {
  // Get the issue to find its project
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: { projectId: true, status: true, order: true },
  });

  if (!issue) {
    throw new Error("Issue not found");
  }

  const oldStatus = issue.status;
  const oldOrder = issue.order;

  // If nothing changed, skip
  if (oldStatus === newStatus && oldOrder === newOrder) {
    return;
  }

  // Use a transaction to keep order values consistent
  await prisma.$transaction(async (tx) => {
    // If moving to a different column, close the gap in the old column
    if (oldStatus !== newStatus) {
      await tx.issue.updateMany({
        where: {
          projectId: issue.projectId,
          status: oldStatus,
          order: { gt: oldOrder },
        },
        data: {
          order: { decrement: 1 },
        },
      });
    }

    // Make room in the target column at the new position
    if (oldStatus !== newStatus) {
      // Moving to a different column: shift everything at or after newOrder down
      await tx.issue.updateMany({
        where: {
          projectId: issue.projectId,
          status: newStatus,
          order: { gte: newOrder },
        },
        data: {
          order: { increment: 1 },
        },
      });
    } else {
      // Reordering within the same column
      if (newOrder > oldOrder) {
        // Moving down: shift items between old and new position up
        await tx.issue.updateMany({
          where: {
            projectId: issue.projectId,
            status: newStatus,
            order: { gt: oldOrder, lte: newOrder },
            id: { not: issueId },
          },
          data: {
            order: { decrement: 1 },
          },
        });
      } else if (newOrder < oldOrder) {
        // Moving up: shift items between new and old position down
        await tx.issue.updateMany({
          where: {
            projectId: issue.projectId,
            status: newStatus,
            order: { gte: newOrder, lt: oldOrder },
            id: { not: issueId },
          },
          data: {
            order: { increment: 1 },
          },
        });
      }
    }

    // Update the moved issue
    await tx.issue.update({
      where: { id: issueId },
      data: {
        status: newStatus,
        order: newOrder,
      },
    });
  });
}