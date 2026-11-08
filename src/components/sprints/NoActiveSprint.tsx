"use client";

// STUB — replaced by the sprints UI track.
import type { SprintWithCounts } from "@/types";

export interface NoActiveSprintProps {
  projectId: string;
  /** Planned sprints that could be started. */
  plannedSprints: SprintWithCounts[];
  /** Number of issues in the backlog (sprintId = null). */
  backlogCount: number;
}

export function NoActiveSprint({ plannedSprints, backlogCount }: NoActiveSprintProps) {
  return (
    <div className="p-8 text-sm text-muted-foreground">
      No active sprint. {plannedSprints.length} planned, {backlogCount} in backlog.
    </div>
  );
}
