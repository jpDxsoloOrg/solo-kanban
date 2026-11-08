"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@dxsolo/ui";
import type { IssueWithRelations } from "@/types";
import { IssuePriority, IssueStatus } from "@prisma/client";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachClosestEdge, extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { MoveMenu } from "./MoveMenu";

interface IssueCardProps {
  issue: IssueWithRelations;
  onMoveIssue: (issueId: string, newStatus: IssueStatus, newOrder: number) => void;
  onSelect: (issue: IssueWithRelations) => void;
  /** Move the card to the end of another column (the "Move" menu). */
  onMoveToStatus?: (issueId: string, status: IssueStatus) => void;
  /** Disables the "Move" menu's options, e.g. while another move is saving. */
  moveDisabled?: boolean;
}

const priorityConfig: Record<
  IssuePriority,
  { label: string; className: string }
> = {
  URGENT: { label: "Urgent", className: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
  HIGH: { label: "High", className: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  MEDIUM: { label: "Med", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300" },
  LOW: { label: "Low", className: "bg-gray-100 text-gray-500 dark:bg-gray-500/15 dark:text-gray-300" },
};

export function IssueCard({ issue, onMoveIssue, onSelect, onMoveToStatus, moveDisabled }: IssueCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const priority = priorityConfig[issue.priority];
  const completedSubtasks = issue.subtasks.filter((s) => s.completed).length;
  const totalSubtasks = issue.subtasks.length;
  const commentCount = issue._count?.comments ?? 0;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const cleanupDrag = draggable({
      element: el,
      getInitialData: () => ({
        type: "card",
        issueId: issue.id,
        status: issue.status,
        order: issue.order,
      }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });

    const cleanupDrop = dropTargetForElements({
      element: el,
      getData: ({ input, element }) => {
        return attachClosestEdge(
          { type: "card", issueId: issue.id, status: issue.status, order: issue.order },
          { input, element, allowedEdges: ["top", "bottom"] }
        );
      },
      canDrop: ({ source }) => {
        // Don't allow dropping on yourself
        return source.data.type === "card" && source.data.issueId !== issue.id;
      },
      onDragEnter: ({ self }) => {
        setClosestEdge(extractClosestEdge(self.data));
      },
      onDrag: ({ self }) => {
        setClosestEdge(extractClosestEdge(self.data));
      },
      onDragLeave: () => {
        setClosestEdge(null);
      },
      onDrop: ({ self, source }) => {
        setClosestEdge(null);

        const edge = extractClosestEdge(self.data);
        const targetOrder = issue.order;
        const sourceId = source.data.issueId as string;
        const sourceStatus = source.data.status as IssueStatus;

        // Calculate the new order based on which edge was closest
        let newOrder: number;
        if (edge === "top") {
          newOrder = targetOrder;
        } else {
          newOrder = targetOrder + 1;
        }

        // If moving within the same column and the source was above the target,
        // the target's order will shift after removal, so adjust
        if (sourceStatus === issue.status) {
          const sourceOrder = source.data.order as number;
          if (sourceOrder < targetOrder) {
            newOrder = newOrder - 1;
          }
        }

        onMoveIssue(sourceId, issue.status, newOrder);
      },
    });

    return () => {
      cleanupDrag();
      cleanupDrop();
    };
  }, [issue.id, issue.status, issue.order, onMoveIssue]);

  return (
    <div
      ref={ref}
      data-issue-id={issue.id}
      className="group relative"
      onClick={() => onSelect(issue)}
    >
      {/* Drop indicator: top edge */}
      {closestEdge === "top" && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 -translate-y-1 rounded-full" />
      )}

      <Card
        className={`cursor-pointer pointer-fine:cursor-grab hover:ring-2 hover:ring-blue-300 dark:hover:ring-blue-500/50 transition-shadow ${
          isDragging ? "opacity-40" : ""
        }`}
      >
        <CardContent className="p-3">
          {/* Title: a real link so keyboard users can open the issue. It is
              not draggable itself, so dragging still picks up the card. */}
          <h3 className={`text-sm font-medium leading-snug wrap-anywhere ${issue.status === "DONE" ? "line-through text-muted-foreground" : ""}`}>
            <Link
              href={`/projects/${issue.projectId}/issues/${issue.number}`}
              prefetch={false}
              draggable={false}
              onClick={(e) => e.stopPropagation()}
              className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="text-muted-foreground font-normal">#{issue.number}</span>{" "}
              {issue.title}
            </Link>
          </h3>

          {/* Meta row: priority + epic label, comments, move */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span
              className={`text-xs font-medium px-1.5 py-0.5 rounded ${priority.className}`}
            >
              {priority.label}
            </span>

            {/* Epic label: hidden when container is too narrow */}
            {issue.epic && (
              <span
                className="text-xs px-1.5 py-0.5 rounded hidden @[200px]:inline-block max-w-full truncate"
                style={{
                  backgroundColor: `${issue.epic.color}20`,
                  color: issue.epic.color,
                }}
              >
                {issue.epic.name}
              </span>
            )}

            <span className="ml-auto flex items-center gap-2">
              {commentCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                  aria-label={`${commentCount} comment${commentCount === 1 ? "" : "s"}`}
                  title={`${commentCount} comment${commentCount === 1 ? "" : "s"}`}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  >
                    <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
                  </svg>
                  {commentCount}
                </span>
              )}

              {onMoveToStatus && (
                <MoveMenu
                  issueId={issue.id}
                  issueNumber={issue.number}
                  currentStatus={issue.status}
                  onMove={(status) => onMoveToStatus(issue.id, status)}
                  disabled={moveDisabled}
                  // Where hover exists the button is only revealed on hover,
                  // so overlay it on the card corner instead of taking space.
                  className="[@media(hover:hover)]:absolute [@media(hover:hover)]:top-2 [@media(hover:hover)]:right-2 [@media(hover:hover)]:shadow-sm"
                />
              )}
            </span>
          </div>

          {/* Subtask progress */}
          {totalSubtasks > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{
                    width: `${(completedSubtasks / totalSubtasks) * 100}%`,
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {completedSubtasks}/{totalSubtasks}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drop indicator: bottom edge */}
      {closestEdge === "bottom" && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 translate-y-1 rounded-full" />
      )}
    </div>
  );
}
