"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import type { Comment } from "@prisma/client";
import { addComment } from "@/actions/comment-actions";
import type { CommentWithReplies } from "@/types";
import { useServerState } from "@/components/live/useServerState";
import { CommentComposer } from "./CommentComposer";
import type { OrphanedDraft } from "./CommentItem";
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
 * drafts, open editors and expanded threads are kept. A reply or edit whose
 * comment was deleted elsewhere is kept too, and offered as a new comment.
 */
export function CommentThread(props: CommentThreadProps) {
  // Start from fresh state (and drop drafts) if the issue ever changes in place.
  return <CommentSection key={props.issueId} {...props} />;
}

function CommentSection({ issueId, initialComments }: CommentThreadProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [threads, setThreads] = useServerState(initialComments);
  // Drafts whose comment disappeared in a refresh, offered as new comments.
  const [orphans, setOrphans] = useState<{ id: number; kind: OrphanedDraft["kind"]; body: string }[]>(
    [],
  );
  const nextOrphanId = useRef(0);
  // Comments deleted from this page: their drafts go with them, as the
  // delete confirmation says.
  const deletedHereRef = useRef(new Set<string>());

  // Latest threads, so an unmounted editor can tell "deleted elsewhere" from
  // "merely hidden" (e.g. its thread was collapsed).
  // A layout effect, so it's already current when a removed comment's
  // (passive) cleanup reports its draft in the same commit.
  const threadsRef = useRef(threads);
  useLayoutEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  const handleDraftOrphaned = useCallback((draft: OrphanedDraft) => {
    if (draft.commentIds.some((id) => id !== null && deletedHereRef.current.has(id))) return;
    if (draft.kind === "edit") {
      const [commentId] = draft.commentIds;
      const stillExists = threadsRef.current.some(
        (thread) => thread.id === commentId || thread.replies.some((reply) => reply.id === commentId),
      );
      if (stillExists) return;
    }
    nextOrphanId.current += 1;
    const id = nextOrphanId.current;
    setOrphans((prev) => [...prev, { id, kind: draft.kind, body: draft.body }]);
    requestAnimationFrame(() => {
      const panel = document.getElementById(`orphaned-draft-${id}`);
      panel?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      // Focus went down with the removed comment: move it to the draft.
      if (panel && (document.activeElement === null || document.activeElement === document.body)) {
        panel.querySelector("textarea")?.focus({ preventScroll: true });
      }
    });
  }, []);

  const dismissOrphan = (id: number) => {
    setOrphans((prev) => prev.filter((orphan) => orphan.id !== id));
  };

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
    deletedHereRef.current.add(commentId);
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
              onDraftOrphaned={handleDraftOrphaned}
            />
          ))}
        </ol>
      )}

      {orphans.map((orphan) => (
        <div
          key={orphan.id}
          id={`orphaned-draft-${orphan.id}`}
          className="mt-4 rounded-lg border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-500/40 dark:bg-amber-500/10 sm:p-4"
        >
          <p role="alert" className="mb-2 text-sm text-foreground">
            {orphan.kind === "reply"
              ? "The comment you were replying to was deleted elsewhere, so your reply wasn't posted."
              : "The comment you were editing was deleted elsewhere, so your changes weren't saved."}{" "}
            You can post the text as a new comment.
          </p>
          <CommentComposer
            label="Post your unsent text as a new comment"
            initialValue={orphan.body}
            submitLabel="Post as comment"
            pendingLabel="Posting…"
            cancelLabel="Discard"
            onSubmit={async (body) => {
              const result = await handleAdd(body);
              if (result.ok) dismissOrphan(orphan.id);
              return result;
            }}
            onCancel={() => dismissOrphan(orphan.id)}
            minHeightClass="min-h-[72px]"
          />
        </div>
      ))}

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
