"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { IssueStatus } from "@prisma/client";
import type { Epic, Sprint } from "@prisma/client";
import { Column } from "./Column";
import type { IssueWithRelations, SprintWithCounts } from "@/types";
import { SprintHeader } from "@/components/sprints/SprintHeader";
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
  /** Every issue in the active sprint (unfiltered). */
  issues: IssueWithRelations[];
  projectId: string;
  epics: Epic[];
  /** Epic id from the ?epic= filter; applied here so sprint stats stay whole. */
  epicFilter: string | null;
  /** The active sprint this board shows. */
  sprint: Sprint;
  /** Planned sprints, offered as roll-over targets when completing the sprint. */
  plannedSprints: SprintWithCounts[];
}

export function Board({
  issues: initialIssues,
  projectId,
  epics,
  epicFilter,
  sprint,
  plannedSprints,
}: BoardProps) {
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

  const issuesByStatus = COLUMNS.map((col) => {
    const columnIssues = issues
      .filter((issue) => issue.status === col.status)
      .sort((a, b) => a.order - b.order);
    return {
      ...col,
      totalCount: columnIssues.length,
      issues: epicFilter
        ? columnIssues.filter((issue) => issue.epicId === epicFilter)
        : columnIssues,
    };
  });

  return (
    <div className="h-full flex flex-col min-h-0">
      <SprintHeader
        sprint={sprint}
        issues={issues}
        projectId={projectId}
        plannedSprints={plannedSprints}
      />
      <div className="flex-1 min-h-0 p-4 overflow-x-auto">
      <div className="grid grid-cols-4 gap-4 h-full min-w-[800px]">
        {issuesByStatus.map((col) => (
          <Column
            key={col.status}
            status={col.status}
            label={col.label}
            issues={col.issues}
            totalCount={col.totalCount}
            sprintId={sprint.id}
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
      </div>
      <ShortcutsDialog open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}