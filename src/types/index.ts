import type { Issue, Epic, Subtask, Sprint, Comment } from "@prisma/client";

export type IssueWithRelations = Issue & {
  epic: Epic | null;
  subtasks: Subtask[];
  /** Included wherever the issue's sprint matters (board, issue page). */
  sprint?: Sprint | null;
  /** Included on the board so cards can show a comment count. */
  _count?: { comments: number };
};

/** A top-level comment with its (one level deep) replies, oldest first. */
export type CommentWithReplies = Comment & {
  replies: Comment[];
};

export type SprintWithCounts = Sprint & {
  _count: { issues: number };
};

/**
 * Return shape for mutations that can fail for user-facing reasons. Next.js
 * hides thrown error messages from server actions in production, so actions
 * whose errors the UI needs to display return this instead of throwing.
 */
export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };
