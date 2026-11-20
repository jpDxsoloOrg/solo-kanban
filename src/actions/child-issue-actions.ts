"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createIssue } from "@/actions/create-issue";
import { updateIssueWithEffects } from "@/actions/update-issue";
import type { ParentAutoMove } from "@/lib/issue-hierarchy";
import type { ActionResult, ChildIssueSummary } from "@/types";
import { MAX_ISSUE_TITLE_LENGTH } from "@/lib/limits";

/**
 * The issue page's Subtasks section. Child issues are ordinary issues, so
 * these wrap createIssue/updateIssue (which apply the sprint/epic
 * inheritance and parent auto-moves) and only shape results for the list.
 */

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function toSummary(issue: ChildIssueSummary): ChildIssueSummary {
  const { id, number, title, status, priority, childOrder } = issue;
  return { id, number, title, status, priority, childOrder };
}

/** Add a subtask (a new child issue) at the end of the parent's list. */
export async function createChildIssue(
  parentId: string,
  title: string,
): Promise<ActionResult<ChildIssueSummary>> {
  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: "Subtask title can't be empty." };
  if (trimmed.length > MAX_ISSUE_TITLE_LENGTH) {
    return { ok: false, error: `Subtask title must be ${MAX_ISSUE_TITLE_LENGTH} characters or fewer.` };
  }
  try {
    const parent = await prisma.issue.findUnique({
      where: { id: parentId },
      select: { projectId: true },
    });
    if (!parent) return { ok: false, error: "Issue not found." };
    // It inherits the parent's sprint and epic, and starts Open.
    const child = await createIssue({ projectId: parent.projectId, title: trimmed, parentId });
    return { ok: true, data: toSummary(child) };
  } catch (error) {
    console.error("createChildIssue failed:", error);
    return { ok: false, error: errorMessage(error, "Failed to add the subtask.") };
  }
}

/** Mark a subtask done, or open again; its parent may move forward. */
export async function setChildIssueDone(
  childId: string,
  done: boolean,
): Promise<ActionResult<{ child: ChildIssueSummary; autoMoves: ParentAutoMove[] }>> {
  try {
    const { issue, autoMoves } = await updateIssueWithEffects(childId, { status: done ? "DONE" : "OPEN" });
    revalidatePath(`/projects/${issue.projectId}`, "layout");
    return { ok: true, data: { child: toSummary(issue), autoMoves } };
  } catch (error) {
    console.error("setChildIssueDone failed:", error);
    return { ok: false, error: errorMessage(error, "Failed to update the subtask.") };
  }
}

/** Move a subtask to position `index` (0-based) in its parent's list. */
export async function reorderChildIssue(childId: string, index: number): Promise<ActionResult> {
  try {
    const { issue } = await updateIssueWithEffects(childId, { childOrder: index });
    revalidatePath(`/projects/${issue.projectId}`, "layout");
    return { ok: true, data: null };
  } catch (error) {
    console.error("reorderChildIssue failed:", error);
    return { ok: false, error: errorMessage(error, "Failed to reorder the subtask.") };
  }
}
