"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { AlertDialog, Button } from "@dxsolo/ui";
import type { Comment } from "@prisma/client";
import { deleteComment, updateComment } from "@/actions/comment-actions";
import { CommentBody } from "./CommentBody";
import { CommentComposer, TOUCH_BUTTON_SIZE } from "./CommentComposer";
import { RelativeTime, formatFullDateTime } from "./RelativeTime";
import { useNow } from "./useNow";

export interface CommentItemProps {
  comment: Comment;
  /** Replies are rendered indented under their thread's top-level comment. */
  isReply?: boolean;
  /** Replies that are deleted along with this (top-level) comment. */
  replyCount?: number;
  /** Open the thread's reply composer; the clicked button is passed for focus restore. */
  onReply: (opener: HTMLElement) => void;
  onUpdated: (comment: Comment) => void;
  onDeleted: (commentId: string) => void;
}

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function EditedLabel({ editedAt }: { editedAt: Date | string }) {
  // Tooltip depends on the browser time zone: only set it after hydration.
  const now = useNow();
  return (
    <span
      className="text-xs text-muted-foreground"
      title={now === null ? undefined : `Edited ${formatFullDateTime(new Date(editedAt))}`}
    >
      (edited)
    </span>
  );
}

/** Small text action. Always visible on touch screens; see the group below. */
const actionClass = `${TOUCH_BUTTON_SIZE} px-2.5 text-xs text-muted-foreground hover:text-foreground [@media(hover:hover)]:h-7 [@media(hover:hover)]:px-2`;

export function CommentItem({
  comment,
  isReply = false,
  replyCount = 0,
  onReply,
  onUpdated,
  onDeleted,
}: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const restoreEditFocus = useRef(false);

  useEffect(() => {
    if (!editing && restoreEditFocus.current) {
      restoreEditFocus.current = false;
      editButtonRef.current?.focus();
    }
  }, [editing]);

  const noun = isReply ? "reply" : "comment";

  const closeEditor = () => {
    restoreEditFocus.current = true;
    setEditing(false);
  };

  const handleSave = async (body: string) => {
    if (body === comment.body) {
      closeEditor();
      return { ok: true as const, data: null };
    }
    const result = await updateComment(comment.id, body);
    if (result.ok) {
      onUpdated(result.data);
      closeEditor();
    }
    return result;
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    let failure: string;
    try {
      const result = await deleteComment(comment.id);
      if (result.ok) {
        // Unmounts this item (and its dialog).
        onDeleted(comment.id);
        return;
      }
      failure = result.error;
    } catch (err) {
      console.error("Failed to delete comment:", err);
      failure = `Couldn't delete this ${noun}. Please try again.`;
    }
    setDeleting(false);
    setConfirmingDelete(false);
    setError(failure);
  };

  const deleteTitle =
    !isReply && replyCount > 0 ? "Delete comment and replies?" : `Delete ${noun}?`;
  const deleteDescription =
    !isReply && replyCount > 0
      ? `This comment and its ${pluralize(replyCount, "reply", "replies")} will be permanently deleted.`
      : `This ${noun} will be permanently deleted.`;

  return (
    <article id={`comment-${comment.id}`} className="group/comment min-w-0">
      <header className="flex min-h-9 flex-wrap items-center gap-x-2 [@media(hover:hover)]:min-h-7">
        <RelativeTime
          date={comment.createdAt}
          className="text-xs font-medium text-muted-foreground"
        />
        {comment.editedAt && <EditedLabel editedAt={comment.editedAt} />}

        <div
          className={`-mr-2 ml-auto flex items-center transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/comment:opacity-100 focus-within:opacity-100 ${
            editing ? "hidden" : ""
          }`}
        >
          <Button
            type="button"
            intent="ghost"
            size="sm"
            className={actionClass}
            aria-label={`Reply to ${noun}`}
            onClick={(event: MouseEvent<HTMLButtonElement>) => onReply(event.currentTarget)}
          >
            Reply
          </Button>
          <Button
            ref={editButtonRef}
            type="button"
            intent="ghost"
            size="sm"
            className={actionClass}
            aria-label={`Edit ${noun}`}
            onClick={() => {
              setError(null);
              setEditing(true);
            }}
          >
            Edit
          </Button>
          <Button
            type="button"
            intent="ghost"
            size="sm"
            className={`${actionClass} hover:text-destructive dark:hover:text-red-400`}
            aria-label={`Delete ${noun}`}
            onClick={() => {
              setError(null);
              setConfirmingDelete(true);
            }}
          >
            Delete
          </Button>
        </div>
      </header>

      {editing ? (
        <div className="mt-1">
          <CommentComposer
            label={`Edit ${noun}`}
            initialValue={comment.body}
            submitLabel="Save"
            pendingLabel="Saving…"
            onSubmit={handleSave}
            onCancel={closeEditor}
            autoFocus
            minHeightClass="min-h-[72px]"
          />
        </div>
      ) : (
        <CommentBody body={comment.body} />
      )}

      {error && (
        <p role="alert" className="mt-1 text-sm text-destructive dark:text-red-400">
          {error}
        </p>
      )}

      <AlertDialog
        open={confirmingDelete}
        onClose={() => {
          if (!deleting) setConfirmingDelete(false);
        }}
        onConfirm={handleDelete}
        title={deleteTitle}
        description={deleteDescription}
        confirmLabel="Delete"
        intent="destructive"
        loading={deleting}
        className="w-[calc(100%-2rem)]"
      />
    </article>
  );
}
