"use server";

import { prisma } from "@/lib/prisma";
import type { IssuePriority, IssueStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  lockProjectOrdering,
  nextOrderInColumn,
  ORDER_TRANSACTION_OPTIONS,
} from "@/lib/issue-order";
import { moveChild, nextChildOrder, requireParentFor, syncParentStatus } from "@/lib/issue-hierarchy";
import { issueViewInclude } from "@/lib/issue-include";

export interface CreateIssueInput {
  projectId: string;
  title: string;
  /** Markdown. */
  description?: string | null;
  status?: IssueStatus;
  priority?: IssuePriority;
  /**
   * Omitted: no epic, or the parent's epic for a child issue. null: no epic.
   */
  epicId?: string | null;
  /**
   * Sprint to create the issue in; null puts it in the backlog. Omitted: the
   * backlog, or the parent's sprint for a child issue.
   */
  sprintId?: string | null;
  /** Makes the new issue a child (subtask) of this issue. */
  parentId?: string | null;
  /** Position among the parent's children; defaults to the end. */
  childOrder?: number;
  /** Don't move the parent forward to match its children (conversions). */
  skipParentSync?: boolean;
}

export async function createIssue({
  projectId,
  title,
  description,
  status = "OPEN",
  priority,
  epicId,
  sprintId,
  parentId = null,
  childOrder,
  skipParentSync = false,
}: CreateIssueInput) {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Issue title can't be empty.");

  const issue = await prisma.$transaction(async (tx) => {
    // Appending computes max(order) + 1: serialize with board moves.
    await lockProjectOrdering(tx, projectId);

    let targetSprintId = sprintId ?? null;
    let targetEpicId = epicId ?? null;
    // A finished child inherits its parent's sprint even when that sprint is
    // completed: it is archived with its parent.
    let joinsArchive = false;
    if (parentId) {
      const parent = await requireParentFor(tx, projectId, parentId, null);
      // Children start where their parent is.
      if (epicId === undefined) targetEpicId = parent.epicId;
      if (sprintId === undefined) {
        if (parent.sprintStatus === "COMPLETED") {
          // Unfinished work can't join a completed sprint: it starts in the backlog.
          joinsArchive = status === "DONE";
          targetSprintId = joinsArchive ? parent.sprintId : null;
        } else {
          targetSprintId = parent.sprintId;
        }
      }
    }

    if (targetSprintId) {
      // KEY SHARE lock: waits for a completeSprint in progress (which holds
      // the sprint FOR UPDATE), so a new card can't land in a sprint that is
      // being completed.
      const [sprint] = await tx.$queryRaw<{ projectId: string; status: string }[]>`
        SELECT "projectId", "status" FROM "Sprint" WHERE "id" = ${targetSprintId} FOR KEY SHARE`;
      if (!sprint || sprint.projectId !== projectId) throw new Error("Sprint not found.");
      if (sprint.status === "COMPLETED" && !joinsArchive) {
        throw new Error("Issues can't be added to a completed sprint.");
      }
    }

    // Place the new issue at the end of its column (sprint + status).
    // Queries run sequentially: a transaction holds a single connection.
    const order = await nextOrderInColumn(tx, { projectId, sprintId: targetSprintId, status });
    const maxNumber = await tx.issue.aggregate({ where: { projectId }, _max: { number: true } });
    const position = parentId ? await nextChildOrder(tx, parentId) : 0;

    const created = await tx.issue.create({
      data: {
        title: trimmed,
        ...(description && { description }),
        status,
        order,
        number: (maxNumber._max.number ?? 0) + 1,
        projectId,
        sprintId: targetSprintId,
        ...(priority && { priority }),
        ...(targetEpicId && { epicId: targetEpicId }),
        ...(parentId && { parentId, childOrder: position }),
      },
      select: { id: true },
    });

    // Appended above; an explicit position shifts the siblings after it.
    if (parentId && childOrder !== undefined) await moveChild(tx, parentId, created.id, childOrder);
    if (parentId && !skipParentSync) await syncParentStatus(tx, parentId);

    return tx.issue.findUniqueOrThrow({ where: { id: created.id }, include: issueViewInclude });
  }, ORDER_TRANSACTION_OPTIONS);

  revalidatePath(`/projects/${projectId}`, "layout");
  return issue;
}
