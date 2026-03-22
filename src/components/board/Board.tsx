"use client";

import { useState, useCallback } from "react";
import { IssueStatus } from "@prisma/client";
import { Column } from "./Column";
import type { IssueWithRelations } from "@/types";
import { moveIssue } from "@/actions/move-issue";

const COLUMNS: { status: IssueStatus; label: string }[] = [
  { status: "OPEN", label: "Open" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "REVIEW", label: "Review" },
  { status: "DONE", label: "Done" },
];

interface BoardProps {
  issues: IssueWithRelations[];
}

export function Board({ issues: initialIssues }: BoardProps) {
  const [issues, setIssues] = useState(initialIssues);

  const handleMoveIssue = useCallback(
    async (issueId: string, newStatus: IssueStatus, newOrder: number) => {
      // Snapshot for rollback
      const previousIssues = issues;

      // Optimistic update
      setIssues((prev) => {
        const issue = prev.find((i) => i.id === issueId);
        if (!issue) return prev;

        // Remove the issue from its current position
        const without = prev.filter((i) => i.id !== issueId);

        // Get issues in the target column, sorted by order
        const targetColumnIssues = without
          .filter((i) => i.status === newStatus)
          .sort((a, b) => a.order - b.order);

        // Clamp the order to valid range
        const clampedOrder = Math.min(newOrder, targetColumnIssues.length);

        // Insert at the new position and re-index the target column
        targetColumnIssues.splice(clampedOrder, 0, {
          ...issue,
          status: newStatus,
          order: clampedOrder,
        });

        // Re-index all items in the target column
        const reindexed = targetColumnIssues.map((item, index) => ({
          ...item,
          order: index,
        }));

        // Rebuild the full issue list
        const otherIssues = without.filter((i) => i.status !== newStatus);
        return [...otherIssues, ...reindexed];
      });

      // Persist to database
      try {
        await moveIssue(issueId, newStatus, newOrder);
      } catch (error) {
        console.error("Failed to move issue:", error);
        // Rollback on failure
        setIssues(previousIssues);
      }
    },
    [issues]
  );

  const issuesByStatus = COLUMNS.map((col) => ({
    ...col,
    issues: issues
      .filter((issue) => issue.status === col.status)
      .sort((a, b) => a.order - b.order),
  }));

  return (
    <div className="h-full p-4 overflow-x-auto">
      <div className="grid grid-cols-4 gap-4 h-full min-w-[800px]">
        {issuesByStatus.map((col) => (
          <Column
            key={col.status}
            status={col.status}
            label={col.label}
            issues={col.issues}
            onMoveIssue={handleMoveIssue}
          />
        ))}
      </div>
    </div>
  );
}