"use client";

import { useId, useRef } from "react";
import type { Comment } from "@prisma/client";
import { addComment } from "@/actions/comment-actions";
import type { CommentWithReplies } from "@/types";
import { useServerState } from "@/components/live/useServerState";
import { CommentComposer } from "./CommentComposer";
import { CommentThreadItem } from "./CommentThreadItem";

export interface CommentThreadProps {
  issueId: string;
  /** Top-level comments with replies, oldest first (server-rendered). */
  initialComments: CommentWithReplies[];
}

function scrollIntoViewSoon(elementId: string) {
  requestAnimationFrame(() => {
    document.getElementById(elementId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}

/**
 * The "Comments" section of the issue page. Comments live in client state
 * seeded from the server render and are updated from each action's result,
 * so posting, editing and deleting never needs a page refresh. Refreshed
 * server data (live updates from other tabs/devices) replaces that state;
 * drafts, open editors and expanded threads are kept.
 */
export function CommentThread(props: CommentThreadProps) {
  // Start from fresh state (and drop drafts) if the issue ever changes in place.
  return <CommentSection key={props.issueId} {...props} />;
}

function CommentSection({ issueId, initialComments }: CommentThreadProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [threads, setThreads] = useServerState(initialComments);

  const total = threads.reduce((count, thread) => count + 1 + thread.replies.length, 0);

  // The revalidated page data may already contain a new comment by the time
  // an action's result arrives, so adds skip comments that are already there.
  const handleAdd = async (body: string) => {
    const result = await addComment(issueId, body);
    if (result.ok) {
      const added = result.data;
      setThreads((prev) =>
        prev.some((thread) => thread.id === added.id) ? prev : [...prev, { ...added, replies: [] }],
      );
      scrollIntoViewSoon(`comment-${added.id}`);
    }
    return result;
  };

  const handleReplyAdded = (reply: Comment) => {
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === reply.parentId && !thread.replies.some((r) => r.id === reply.id)
          ? { ...thread, replies: [...thread.replies, reply] }
          : thread,
      ),
    );
    scrollIntoViewSoon(`comment-${reply.id}`);
  };

  const handleUpdated = (updated: Comment) => {
    setThreads((prev) =>
      prev.map((thread) => {
        if (thread.id === updated.id) return { ...updated, replies: thread.replies };
        if (thread.id !== updated.parentId) return thread;
        return {
          ...thread,
          replies: thread.replies.map((reply) => (reply.id === updated.id ? updated : reply)),
        };
      }),
    );
  };

  const handleDeleted = (commentId: string) => {
    setThreads((prev) =>
      prev
        .filter((thread) => thread.id !== commentId)
        .map((thread) =>
          thread.replies.some((reply) => reply.id === commentId)
            ? { ...thread, replies: thread.replies.filter((reply) => reply.id !== commentId) }
            : thread,
        ),
    );
    // The focused Delete button is gone; keep focus inside the section.
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  };

  return (
    <section aria-labelledby={headingId} className="mt-8 min-w-0">
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground focus:outline-none"
      >
        Comments
        <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {total}
        </span>
      </h2>

      {threads.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-6 text-center">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="mb-1 h-6 w-6 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            <path d="M4 5h16v11H10l-4 3.5V16H4z" />
            <path d="M8 9.5h8M8 12.5h5" />
          </svg>
          <p className="text-sm font-medium text-foreground">No comments yet</p>
          <p className="text-sm text-muted-foreground">
            Jot down notes, decisions, or questions about this issue below.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {threads.map((thread) => (
            <CommentThreadItem
              key={thread.id}
              issueId={issueId}
              thread={thread}
              onReplyAdded={handleReplyAdded}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </ol>
      )}

      <div className="mt-4">
        <CommentComposer
          label="Add a comment"
          placeholder="Leave a comment…"
          submitLabel="Comment"
          pendingLabel="Posting…"
          onSubmit={handleAdd}
        />
      </div>
    </section>
  );
}
