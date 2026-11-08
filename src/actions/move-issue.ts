"use server";

import { prisma } from "@/lib/prisma";
import { IssueStatus } from "@prisma/client";
import { lockIssue, normalizeColumn, ORDER_TRANSACTION_OPTIONS } from "@/lib/issue-order";

/**
 * Drag-and-drop move on the board. Orders are scoped to the issue's own
 * sprint (or the backlog), so moving never disturbs other sprints' columns.
 */
export async function moveIssue(
  issueId: string,
  newStatus: IssueStatus,
  newOrder: number
) {
  // Use a transaction to keep order values consistent
  await prisma.$transaction(async (tx) => {
    const issue = await lockIssue(tx, issueId);
    if (!issue) {
      throw new Error("Issue not found");
    }

    // The board only shows the active sprint, so this is a stale board after
    // the sprint was completed elsewhere. Its issues are archived history;
    // the board rolls the card back and asks the user to try again.
    if (issue.sprintStatus === "COMPLETED") {
      throw new Error("This issue's sprint has been completed. Reload the board.");
    }

    const oldStatus = issue.status;
    const oldOrder = issue.order;
    const column = { projectId: issue.projectId, sprintId: issue.sprintId };

    // newOrder is an index among the target column's other issues, computed
    // from the client's (possibly stale) copy: keep it inside the column.
    const otherIssues = await tx.issue.count({
      where: { ...column, status: newStatus, id: { not: issueId } },
    });
    newOrder = Math.max(0, Math.min(Math.trunc(newOrder) || 0, otherIssues));

    // If nothing changed, skip
    if (oldStatus === newStatus && oldOrder === newOrder) {
      return;
    }

    // If moving to a different column, close the gap in the old column
    if (oldStatus !== newStatus) {
      await tx.issue.updateMany({
        where: {
          ...column,
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
          ...column,
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
            ...column,
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
            ...column,
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

    // Keep both columns 0..n-1 even if they already had gaps or duplicates
    // (e.g. two devices moving cards at the same moment).
    await normalizeColumn(tx, { ...column, status: newStatus });
    if (oldStatus !== newStatus) {
      await normalizeColumn(tx, { ...column, status: oldStatus });
    }
  }, ORDER_TRANSACTION_OPTIONS);
}
