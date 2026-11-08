"use client";

import { useEffect, useId, useRef, useState, useCallback } from "react";
import type { Comment } from "@prisma/client";
import { addComment } from "@/actions/comment-actions";
import type { CommentWithReplies } from "@/types";
import { CommentComposer } from "./CommentComposer";
import { CommentItem, type OrphanedDraft } from "./CommentItem";

/** Threads with more replies than this start with the older ones collapsed. */
const COLLAPSE_AFTER = 3;
/** How many of the newest replies stay visible while collapsed. */
const VISIBLE_WHEN_COLLAPSED = 2;

export interface CommentThreadItemProps {
  issueId: string;
  thread: CommentWithReplies;
  onReplyAdded: (reply: Comment) => void;
  onUpdated: (comment: Comment) => void;
  onDeleted: (commentId: string) => void;
  onDraftOrphaned: (draft: OrphanedDraft) => void;
}

/** One top-level comment, its replies, and its reply composer. */
export function CommentThreadItem({
  issueId,
  thread,
  onReplyAdded,
  onUpdated,
  onDeleted,
  onDraftOrphaned,
}: CommentThreadItemProps) {
  const repliesId = useId();
  const [expanded, setExpanded] = useState(false);
  const [editingReplyIds, setEditingReplyIds] = useState<ReadonlySet<string>>(() => new Set());
  const handleEditingChange = useCallback((commentId: string, isEditing: boolean) => {
    setEditingReplyIds((prev) => {
      if (prev.has(commentId) === isEditing) return prev;
      const next = new Set(prev);
      if (isEditing) next.add(commentId);
      else next.delete(commentId);
      return next;
    });
  }, []);
  const [replying, setReplying] = useState(false);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const replyOpenerRef = useRef<HTMLElement | null>(null);
  const restoreReplyFocus = useRef(false);
  const replyDraftRef = useRef("");
  const onDraftOrphanedRef = useRef(onDraftOrphaned);

  useEffect(() => {
    onDraftOrphanedRef.current = onDraftOrphaned;
  }, [onDraftOrphaned]);

  // A refresh that drops this thread (deleted elsewhere) unmounts the reply
  // composer: hand an unsent reply up instead of losing it.
  const threadId = thread.id;
  useEffect(() => {
    return () => {
      const body = replyDraftRef.current;
      if (body.trim()) onDraftOrphanedRef.current({ kind: "reply", body, commentIds: [threadId] });
    };
  }, [threadId]);

  useEffect(() => {
    if (!replying && restoreReplyFocus.current) {
      restoreReplyFocus.current = false;
      const opener = replyOpenerRef.current;
      if (opener?.isConnected) opener.focus();
    }
  }, [replying]);

  const { replies } = thread;
  const collapsible = replies.length > COLLAPSE_AFTER;
  const hiddenCount = collapsible && !expanded ? replies.length - VISIBLE_WHEN_COLLAPSED : 0;
  // A reply being edited stays visible even when older replies collapse, so
  // "Hide older replies" never throws away an open editor.
  const visibleReplies = replies.filter(
    (reply, index) => index >= hiddenCount || editingReplyIds.has(reply.id),
  );
  const olderCount = replies.length - VISIBLE_WHEN_COLLAPSED;

  // Replying to a reply lands in the same thread (threads are one level deep).
  const openReply = (opener: HTMLElement) => {
    replyOpenerRef.current = opener;
    if (replying) replyTextareaRef.current?.focus();
    else setReplying(true);
  };

  const closeReply = () => {
    replyDraftRef.current = "";
    restoreReplyFocus.current = true;
    setReplying(false);
  };

  const handleReply = async (body: string) => {
    const result = await addComment(issueId, body, thread.id);
    if (result.ok) {
      onReplyAdded(result.data);
      closeReply();
    }
    return result;
  };

  return (
    <li className="min-w-0 rounded-lg border border-border bg-background">
      <div className="px-3 pb-2 pt-1 sm:px-4">
        <CommentItem
          comment={thread}
          replyCount={replies.length}
          onReply={openReply}
          onUpdated={onUpdated}
          onDeleted={onDeleted}
          onDraftOrphaned={onDraftOrphaned}
        />
      </div>

      {(replies.length > 0 || replying) && (
        <div className="rounded-b-lg border-t border-border bg-muted/30 px-3 py-2 sm:px-4">
          <div className="min-w-0 border-l-2 border-border pl-3 sm:pl-4">
            {collapsible && (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={repliesId}
                onClick={() => setExpanded((value) => !value)}
                className="-ml-1 inline-flex h-9 items-center rounded-md px-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)]:h-7"
              >
                {expanded
                  ? "Hide older replies"
                  : `Show ${olderCount} more ${olderCount === 1 ? "reply" : "replies"}`}
              </button>
            )}

            {visibleReplies.length > 0 && (
              <ol id={repliesId} aria-label="Replies" className="flex flex-col gap-2">
                {visibleReplies.map((reply) => (
                  <li key={reply.id} className="min-w-0">
                    <CommentItem
                      comment={reply}
                      isReply
                      onReply={openReply}
                      onUpdated={onUpdated}
                      onDeleted={onDeleted}
                      onDraftOrphaned={onDraftOrphaned}
                      onEditingChange={handleEditingChange}
                    />
                  </li>
                ))}
              </ol>
            )}

            {replying && (
              <div className={replies.length > 0 ? "mt-3 pb-1" : "py-1"}>
                <CommentComposer
                  label="Write a reply"
                  placeholder="Write a reply…"
                  submitLabel="Reply"
                  pendingLabel="Replying…"
                  onSubmit={handleReply}
                  onCancel={closeReply}
                  onValueChange={(value) => {
                    replyDraftRef.current = value;
                  }}
                  textareaRef={replyTextareaRef}
                  autoFocus
                  minHeightClass="min-h-[72px]"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
