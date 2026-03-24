"use client";

import { useRef, useEffect, useState } from "react";
import { Card, CardContent } from "@dxsolo/ui";
import type { IssueWithRelations } from "@/types";
import { IssuePriority, IssueStatus } from "@prisma/client";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachClosestEdge, extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";

interface IssueCardProps {
  issue: IssueWithRelations;
  onMoveIssue: (issueId: string, newStatus: IssueStatus, newOrder: number) => void;
  onSelect: (issue: IssueWithRelations) => void;
}

const priorityConfig: Record<
  IssuePriority,
  { label: string; className: string }
> = {
  URGENT: { label: "Urgent", className: "bg-red-100 text-red-700" },
  HIGH: { label: "High", className: "bg-orange-100 text-orange-700" },
  MEDIUM: { label: "Med", className: "bg-yellow-100 text-yellow-700" },
  LOW: { label: "Low", className: "bg-gray-100 text-gray-500" },
};

export function IssueCard({ issue, onMoveIssue, onSelect }: IssueCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const priority = priorityConfig[issue.priority];
  const completedSubtasks = issue.subtasks.filter((s) => s.completed).length;
  const totalSubtasks = issue.subtasks.length;

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
    <div ref={ref} className="relative" onClick={() => onSelect(issue)}>
      {/* Drop indicator: top edge */}
      {closestEdge === "top" && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 -translate-y-1 rounded-full" />
      )}

      <Card
        className={`cursor-grab hover:ring-2 hover:ring-blue-300 transition-shadow ${
          isDragging ? "opacity-40" : ""
        }`}
      >
        <CardContent className="p-3">
          {/* Title */}
          <h3 className={`text-sm font-medium leading-snug ${issue.status === "DONE" ? "line-through text-muted-foreground" : ""}`}>
            <span className="text-muted-foreground font-normal">#{issue.number}</span>{" "}
            {issue.title}
          </h3>

          {/* Meta row: priority + epic label */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span
              className={`text-xs font-medium px-1.5 py-0.5 rounded ${priority.className}`}
            >
              {priority.label}
            </span>

            {/* Epic label: hidden when container is too narrow */}
            {issue.epic && (
              <span
                className="text-xs px-1.5 py-0.5 rounded hidden @[200px]:inline-block"
                style={{
                  backgroundColor: `${issue.epic.color}20`,
                  color: issue.epic.color,
                }}
              >
                {issue.epic.name}
              </span>
            )}
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