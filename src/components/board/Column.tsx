"use client";

import { useRef, useEffect, useState } from "react";
import { IssueStatus } from "@prisma/client";
import type { Epic } from "@prisma/client";
import { IssueCard } from "./IssueCard";
import type { IssueWithRelations } from "@/types";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { CreateIssueForm } from "./CreateIssueForm";
import { Tooltip } from "@dxsolo/ui";
import { columnDomId } from "./columns";

interface ColumnProps {
  status: IssueStatus;
  label: string;
  /** Issues to display (may be narrowed by the epic filter). */
  issues: IssueWithRelations[];
  /** Size of the whole column, ignoring filters; used to append on drop. */
  totalCount: number;
  /** Sprint new issues in this column are created in. */
  sprintId: string;
  onMoveIssue: (issueId: string, newStatus: IssueStatus, newOrder: number) => void;
  onSelectIssue: (issue: IssueWithRelations) => void;
  projectId: string;
  epics: Epic[];
  onIssueCreated: (issue: IssueWithRelations) => void;
  showCreateForm?: boolean;
  onCreateFormChange?: (open: boolean) => void;
  /** Move a card to the end of another column (cards' "Move" menu). */
  onMoveToStatus?: (issueId: string, status: IssueStatus) => void;
  /** Disables the cards' "Move" menu options while a move is saving. */
  moveDisabled?: boolean;
  /** Extra classes for the column root (e.g. hiding it on phones). */
  className?: string;
}

const statusColors: Record<IssueStatus, string> = {
  OPEN: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-200",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200",
  REVIEW: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
  DONE: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-200",
};

const statusBorderColors: Record<IssueStatus, string> = {
  OPEN: "border-t-gray-400",
  IN_PROGRESS: "border-t-blue-500",
  REVIEW: "border-t-amber-500",
  DONE: "border-t-green-500",
};

const emptyMessages: Record<IssueStatus, string> = {
  OPEN: "No open issues. Create one to get started.",
  IN_PROGRESS: "Nothing in progress. Drag or move an issue here.",
  REVIEW: "Review queue is empty.",
  DONE: "No completed issues yet.",
};

export function Column({ status, label, issues, totalCount, sprintId, onMoveIssue, onSelectIssue, projectId, epics, onIssueCreated, showCreateForm: externalShowCreate, onCreateFormChange, onMoveToStatus, moveDisabled, className = "" }: ColumnProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDraggedOver, setIsDraggedOver] = useState(false);
  const [internalShowCreate, setInternalShowCreate] = useState(false);

  const showCreateForm = externalShowCreate ?? internalShowCreate;
  const setShowCreateForm = (val: boolean) => {
    setInternalShowCreate(val);
    onCreateFormChange?.(val);
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    return dropTargetForElements({
      element: el,
      getData: () => ({ type: "column", status }),
      canDrop: ({ source }) => source.data.type === "card",
      onDragEnter: () => setIsDraggedOver(true),
      onDragLeave: () => setIsDraggedOver(false),
      onDrop: ({ source, location }) => {
        setIsDraggedOver(false);

        // If the drop landed on a card within this column, let the card handle it
        const dropTargets = location.current.dropTargets;
        if (dropTargets.length > 1 && dropTargets[0].data.type === "card") {
          return;
        }

        const issueId = source.data.issueId as string;
        const sourceStatus = source.data.status as IssueStatus;

        if (sourceStatus === status) return;

        // Dropping on the column itself puts the card at the end
        const newOrder = totalCount;
        onMoveIssue(issueId, status, newOrder);
      },
    });
  }, [status, totalCount, onMoveIssue]);

  return (
    <section
      ref={ref}
      id={columnDomId(status)}
      aria-label={`${label} column`}
      className={`flex flex-col h-full min-h-0 rounded-lg bg-muted/50 border-t-2 ${statusBorderColors[status]} ${
        isDraggedOver ? "ring-2 ring-blue-300 bg-blue-50/50 dark:ring-blue-500/50 dark:bg-blue-500/10" : ""
      } ${className}`}
    >
      {/* Column header: sticky, never scrolls */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border pointer-fine:py-2">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColors[status]}`}
          >
            {label}
          </span>
          <span className="text-xs text-muted-foreground">{issues.length}</span>
        </div>
        <Tooltip content={`Add issue to ${label}`}>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="-mr-1.5 flex h-9 w-9 items-center justify-center rounded text-lg leading-none text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-fine:mr-0 pointer-fine:h-6 pointer-fine:w-6"
            aria-label={`Add issue to ${label}`}
          >
            +
          </button>
        </Tooltip>
      </div>

      {/* Card list: scrollable, container query context */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-2 flex flex-col gap-2 @container">
        {issues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            onMoveIssue={onMoveIssue}
            onSelect={onSelectIssue}
            onMoveToStatus={onMoveToStatus}
            moveDisabled={moveDisabled}
          />
        ))}

        {issues.length === 0 && (
          <div
            className={`flex items-center justify-center h-32 border-2 border-dashed rounded-lg ${
              isDraggedOver
                ? "border-blue-300 bg-blue-50 dark:border-blue-500/50 dark:bg-blue-500/10"
                : "border-border"
            }`}
          >
            <p className="text-xs text-muted-foreground text-center px-4">
              {emptyMessages[status]}
            </p>
          </div>
        )}

        {showCreateForm && (
          <CreateIssueForm
            projectId={projectId}
            sprintId={sprintId}
            status={status}
            epics={epics}
            onCreated={onIssueCreated}
            onCancel={() => setShowCreateForm(false)}
          />
        )}
      </div>
    </section>
  );
}
