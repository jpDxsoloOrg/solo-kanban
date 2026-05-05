"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { IssueStatus } from "@prisma/client";
import type { Epic } from "@prisma/client";
import { Column } from "./Column";
import type { IssueWithRelations } from "@/types";
import { moveIssue } from "@/actions/move-issue";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { ShortcutsDialog } from "./ShortcutsDialog";

const COLUMNS: { status: IssueStatus; label: string }[] = [
  { status: "OPEN", label: "Open" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "REVIEW", label: "Review" },
  { status: "DONE", label: "Done" },
];

interface BoardProps {
  issues: IssueWithRelations[];
  projectId: string;
  epics: Epic[];
}

export function Board({ issues: initialIssues, projectId, epics }: BoardProps) {
  const router = useRouter();
  const [issues, setIssues] = useState(initialIssues);
  const [isMoving, setIsMoving] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCreateInOpen, setShowCreateInOpen] = useState(false);

  useKeyboardShortcuts([
    {
      key: "?",
      shift: true,
      handler: () => setShowShortcuts(true),
    },
    {
      key: "Escape",
      handler: () => {
        if (showShortcuts) setShowShortcuts(false);
      },
      ignoreInputs: false,
    },
    {
      key: "n",
      handler: () => setShowCreateInOpen(true),
    },
  ]);

  const handleSelectIssue = useCallback(
    (issue: IssueWithRelations) => {
      router.push(`/projects/${projectId}/issues/${issue.number}`);
    },
    [router, projectId]
  );
  const handleMoveIssue = useCallback(
    async (issueId: string, newStatus: IssueStatus, newOrder: number) => {
      if (isMoving) return;
      setIsMoving(true);

      const previousIssues = issues;

      setIssues((prev) => {
        const issue = prev.find((i) => i.id === issueId);
        if (!issue) return prev;

        const without = prev.filter((i) => i.id !== issueId);
        const targetColumnIssues = without
          .filter((i) => i.status === newStatus)
          .sort((a, b) => a.order - b.order);

        const clampedOrder = Math.min(newOrder, targetColumnIssues.length);

        targetColumnIssues.splice(clampedOrder, 0, {
          ...issue,
          status: newStatus,
          order: clampedOrder,
        });

        const reindexed = targetColumnIssues.map((item, index) => ({
          ...item,
          order: index,
        }));

        const otherIssues = without.filter((i) => i.status !== newStatus);
        return [...otherIssues, ...reindexed];
      });

      try {
        await moveIssue(issueId, newStatus, newOrder);
      } catch (error) {
        console.error("Failed to move issue:", error);
        setIssues(previousIssues);
      } finally {
        setIsMoving(false);
      }
    },
    [issues, isMoving]
  );

  const handleIssueCreated = useCallback((issue: IssueWithRelations) => {
    setIssues((prev) => [...prev, issue]);
  }, []);

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
            onSelectIssue={handleSelectIssue}
            projectId={projectId}
            epics={epics}
            onIssueCreated={handleIssueCreated}
            {...(col.status === "OPEN" && {
              showCreateForm: showCreateInOpen,
              onCreateFormChange: setShowCreateInOpen,
            })}
          />
        ))}
      </div>
      <ShortcutsDialog open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}