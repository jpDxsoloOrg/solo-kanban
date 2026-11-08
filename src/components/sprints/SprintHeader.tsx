"use client";

import { useState } from "react";
import { Button } from "@dxsolo/ui";
import type { Sprint } from "@prisma/client";
import type { IssueWithRelations, SprintWithCounts } from "@/types";
import { formatSprintRange } from "@/lib/sprint-dates";
import { CompleteSprintDialog } from "./CompleteSprintDialog";
import { DaysLeft } from "./DaysLeft";
import { ProgressBar } from "./ProgressBar";
import { SprintFormModal } from "./SprintFormModal";

export interface SprintHeaderProps {
  /** The active sprint shown on the board. */
  sprint: Sprint;
  /** Live (optimistically updated), unfiltered issues of the sprint. */
  issues: IssueWithRelations[];
  projectId: string;
  /** Planned sprints, offered as roll-over targets when completing. */
  plannedSprints: SprintWithCounts[];
}

/**
 * Compact sprint summary above the board: name, dates and days left,
 * progress, an expandable goal, and the Edit / Complete sprint actions.
 */
export function SprintHeader({ sprint, issues, projectId, plannedSprints }: SprintHeaderProps) {
  const [goalExpanded, setGoalExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);

  const total = issues.length;
  const done = issues.filter((issue) => issue.status === "DONE").length;
  const range = formatSprintRange(sprint.startDate, sprint.endDate);

  return (
    <section
      aria-labelledby="sprint-header-name"
      className="shrink-0 border-b border-border px-4 pb-2 pt-1 sm:pb-3"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h2
          id="sprint-header-name"
          className="min-w-0 flex-1 truncate text-base font-semibold text-foreground sm:flex-initial"
          title={sprint.name}
        >
          {sprint.name}
        </h2>

        {/* Dates + progress: own row on phones, inline from sm up. */}
        <div className="order-last flex min-w-0 basis-full items-center gap-x-3 text-xs text-muted-foreground sm:order-none sm:basis-auto sm:flex-1">
          {range && <span className="whitespace-nowrap">{range}</span>}
          <DaysLeft endDate={sprint.endDate} />
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
            <ProgressBar
              value={done}
              max={total}
              label={`${sprint.name} progress`}
              className="w-16 sm:w-24"
            />
            <span className="whitespace-nowrap tabular-nums">
              {done}/{total} done
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Button
            intent="ghost"
            size="sm"
            className="h-9 sm:h-8"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${sprint.name}`}
          >
            Edit
          </Button>
          <Button
            intent="primary"
            size="sm"
            className="h-9 sm:h-8"
            onClick={() => setCompleting(true)}
          >
            Complete sprint
          </Button>
        </div>
      </div>

      {sprint.goal && (
        <button
          type="button"
          onClick={() => setGoalExpanded((v) => !v)}
          aria-expanded={goalExpanded}
          className="mt-1 flex w-full min-w-0 items-start gap-1.5 rounded text-left text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="shrink-0 font-medium text-foreground/80">Goal:</span>
          <span
            className={
              goalExpanded
                ? "min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]"
                : "min-w-0 truncate"
            }
          >
            {sprint.goal}
          </span>
          <span className="sr-only">{goalExpanded ? "(collapse)" : "(expand)"}</span>
        </button>
      )}

      <SprintFormModal
        open={editing}
        onClose={() => setEditing(false)}
        projectId={projectId}
        sprint={sprint}
      />
      <CompleteSprintDialog
        open={completing}
        onClose={() => setCompleting(false)}
        projectId={projectId}
        sprint={sprint}
        doneCount={done}
        unfinishedCount={total - done}
        plannedSprints={plannedSprints}
      />
    </section>
  );
}
