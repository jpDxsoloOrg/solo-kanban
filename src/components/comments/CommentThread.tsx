"use client";

// STUB — replaced by the comments UI track.
import type { CommentWithReplies } from "@/types";

export interface CommentThreadProps {
  issueId: string;
  /** Top-level comments with replies, oldest first (server-rendered). */
  initialComments: CommentWithReplies[];
}

export function CommentThread({ initialComments }: CommentThreadProps) {
  return (
    <section className="mt-8">
      <h4 className="text-sm font-medium">Comments ({initialComments.length})</h4>
    </section>
  );
}
