"use server";

import { prisma } from "@/lib/prisma";
import { IssueStatus, IssuePriority } from "@prisma/client";
import {
  lockIssue,
  lockProjectOrdering,
  nextOrderInColumn,
  normalizeColumn,
  ORDER_TRANSACTION_OPTIONS,
} from "@/lib/issue-order";
import {
  moveChild,
  nextChildOrder,
  normalizeChildren,
  requireParentFor,
  syncParentStatus,
  type ParentAutoMove,
} from "@/lib/issue-hierarchy";
import { issueViewInclude } from "@/lib/issue-include";

export interface UpdateIssueInput {
  title?: string;
  description?: string | null;
  status?: IssueStatus;
  priority?: IssuePriority;
  /** null removes the epic; must be an epic of the issue's project. */
  epicId?: string | null;
  /**
   * Make the issue a child of this issue (it goes to the end of the parent's
   * children), or null to make it a top-level issue again.
   */
  parentId?: string | null;
  /** Move the issue to this position (0-based) among its parent's children. */
  childOrder?: number;
}

export interface UpdateIssueOptions {
  /** Don't move parents forward to match their children (conversions). */
  skipParentSync?: boolean;
}

export async function updateIssue(
  issueId: string,
  data: UpdateIssueInput,
  options: UpdateIssueOptions = {},
) {
  const { issue } = await updateIssueWithEffects(issueId, data, options);
  return issue;
}

/**
 * `updateIssue`, also reporting parents the change moved forward (a child
 * started, or the last child finished), so the UI can say so.
 */
export async function updateIssueWithEffects(
  issueId: string,
  data: UpdateIssueInput,
  options: UpdateIssueOptions = {},
) {
  return prisma.$transaction(async (tx) => {
    const { parentId: newParentId, childOrder: newChildOrder, ...fields } = data;

    // Status and parent changes re-order columns (the issue's, or a parent's
    // auto-move): serialize them with board moves.
    if (fields.status !== undefined || newParentId !== undefined || newChildOrder !== undefined) {
      const owner = await tx.issue.findUnique({ where: { id: issueId }, select: { projectId: true } });
      if (!owner) throw new Error("Issue not found");
      await lockProjectOrdering(tx, owner.projectId);
    }

    // Locks the issue and, first, its sprint, so a status change can't
    // interleave with completing that sprint.
    const current = await lockIssue(tx, issueId);
    if (!current) throw new Error("Issue not found");
    const { parentId: oldParentId } = await tx.issue.findUniqueOrThrow({
      where: { id: issueId },
      select: { parentId: true },
    });

    if (fields.epicId) {
      const epic = await tx.epic.findUnique({ where: { id: fields.epicId }, select: { projectId: true } });
      if (!epic || epic.projectId !== current.projectId) throw new Error("Epic not found");
    }

    const patch: Omit<UpdateIssueInput, "parentId" | "childOrder"> & {
      order?: number;
      sprintId?: string | null;
      parentId?: string | null;
      childOrder?: number;
    } = { ...fields };
    const statusChanged = fields.status !== undefined && fields.status !== current.status;
    const parentChanged = newParentId !== undefined && newParentId !== oldParentId;

    if (statusChanged) {
      // Reopening an issue that was archived with a completed sprint would
      // leave it invisible (completed sprints aren't on the board), so send
      // it back to the backlog instead.
      const reopenedFromHistory =
        current.sprintStatus === "COMPLETED" && fields.status !== "DONE";
      const targetSprintId = reopenedFromHistory ? null : current.sprintId;

      patch.sprintId = targetSprintId;
      patch.order = await nextOrderInColumn(tx, {
        projectId: current.projectId,
        sprintId: targetSprintId,
        status: fields.status!,
      });
    }

    if (parentChanged) {
      if (newParentId) {
        await requireParentFor(tx, current.projectId, newParentId, issueId);
        patch.parentId = newParentId;
        patch.childOrder = await nextChildOrder(tx, newParentId);
      } else {
        patch.parentId = null;
        patch.childOrder = 0;
      }
    }

    await tx.issue.update({ where: { id: issueId }, data: patch });

    if (statusChanged) {
      // Close the gap the issue left in its old column.
      await normalizeColumn(tx, {
        projectId: current.projectId,
        sprintId: current.sprintId,
        status: current.status,
      });
    }

    const parentId = parentChanged ? (newParentId ?? null) : oldParentId;
    if (newChildOrder !== undefined) {
      if (!parentId) throw new Error("Only subtasks have a child order.");
      await moveChild(tx, parentId, issueId, newChildOrder);
    }
    if (parentChanged && oldParentId) await normalizeChildren(tx, oldParentId);

    // Parents follow their children: the issue's parent when its status
    // changed or it just joined, and a parent it left (the children that
    // are left may now all be done).
    const autoMoves: ParentAutoMove[] = [];
    if (!options.skipParentSync) {
      const toSync = new Set<string>();
      if (parentId && (statusChanged || parentChanged)) toSync.add(parentId);
      if (parentChanged && oldParentId) toSync.add(oldParentId);
      for (const id of toSync) {
        const moved = await syncParentStatus(tx, id);
        if (moved) autoMoves.push(moved);
      }
    }

    const issue = await tx.issue.findUniqueOrThrow({ where: { id: issueId }, include: issueViewInclude });
    return { issue, autoMoves };
  }, ORDER_TRANSACTION_OPTIONS);
}
