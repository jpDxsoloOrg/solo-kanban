"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { Comment } from "@prisma/client";
import type { ActionResult, CommentWithReplies } from "@/types";
import { MAX_COMMENT_LENGTH } from "@/lib/limits";

function validateBody(body: string): { ok: true; body: string } | { ok: false; error: string } {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Comment can't be empty." };
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: `Comments must be ${MAX_COMMENT_LENGTH.toLocaleString()} characters or fewer.` };
  }
  return { ok: true, body: trimmed };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** Board cards show comment counts and the issue page lists comments. */
function revalidateIssue(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
}

/** Top-level comments (oldest first), each with its replies (oldest first). */
export async function getComments(issueId: string): Promise<CommentWithReplies[]> {
  return prisma.comment.findMany({
    where: { issueId, parentId: null },
    orderBy: { createdAt: "asc" },
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });
}

/**
 * Add a comment to an issue, or a reply when `parentId` is given. Threads are
 * one level deep: replying to a reply attaches the new comment to that
 * reply's top-level parent.
 */
export async function addComment(
  issueId: string,
  body: string,
  parentId?: string | null,
): Promise<ActionResult<Comment>> {
  const validated = validateBody(body);
  if (!validated.ok) return validated;

  try {
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      select: { projectId: true },
    });
    if (!issue) return { ok: false, error: "Issue not found." };

    let threadRootId: string | null = null;
    if (parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, issueId: true, parentId: true },
      });
      if (!parent || parent.issueId !== issueId) {
        return { ok: false, error: "The comment you're replying to no longer exists." };
      }
      threadRootId = parent.parentId ?? parent.id;
    }

    const comment = await prisma.comment.create({
      data: { issueId, body: validated.body, parentId: threadRootId },
    });

    revalidateIssue(issue.projectId);
    return { ok: true, data: comment };
  } catch (error) {
    console.error("addComment failed:", error);
    return { ok: false, error: errorMessage(error, "Failed to add comment.") };
  }
}

/** Edit a comment's body; stamps `editedAt`. */
export async function updateComment(commentId: string, body: string): Promise<ActionResult<Comment>> {
  const validated = validateBody(body);
  if (!validated.ok) return validated;

  try {
    const existing = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { body: true, issue: { select: { projectId: true } } },
    });
    if (!existing) return { ok: false, error: "That comment no longer exists." };

    const comment =
      existing.body === validated.body
        ? await prisma.comment.findUniqueOrThrow({ where: { id: commentId } })
        : await prisma.comment.update({
            where: { id: commentId },
            data: { body: validated.body, editedAt: new Date() },
          });

    revalidateIssue(existing.issue.projectId);
    return { ok: true, data: comment };
  } catch (error) {
    console.error("updateComment failed:", error);
    return { ok: false, error: errorMessage(error, "Failed to update comment.") };
  }
}

/** Delete a comment. Deleting a top-level comment also deletes its replies. */
export async function deleteComment(
  commentId: string,
): Promise<ActionResult<{ id: string; deletedReplies: number }>> {
  try {
    const existing = await prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        issue: { select: { projectId: true } },
        _count: { select: { replies: true } },
      },
    });
    if (!existing) return { ok: false, error: "That comment no longer exists." };

    // Replies cascade via the CommentReplies relation (onDelete: Cascade).
    await prisma.comment.delete({ where: { id: commentId } });

    revalidateIssue(existing.issue.projectId);
    return { ok: true, data: { id: commentId, deletedReplies: existing._count.replies } };
  } catch (error) {
    console.error("deleteComment failed:", error);
    return { ok: false, error: errorMessage(error, "Failed to delete comment.") };
  }
}
