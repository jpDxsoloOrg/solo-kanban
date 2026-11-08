"use client";

// STUB — replaced by the sprints UI track.
import type { Sprint } from "@prisma/client";
import type { IssueWithRelations, SprintWithCounts } from "@/types";

export interface SprintHeaderProps {
  /** The active sprint shown on the board. */
  sprint: Sprint;
  /** Live (optimistically updated), unfiltered issues of the sprint. */
  issues: IssueWithRelations[];
  projectId: string;
  /** Planned sprints, offered as roll-over targets when completing. */
  plannedSprints: SprintWithCounts[];
}

export function SprintHeader({ sprint, issues }: SprintHeaderProps) {
  const done = issues.filter((i) => i.status === "DONE").length;
  return (
    <div className="px-4 py-2 border-b border-border text-sm">
      {sprint.name} — {done}/{issues.length} done
    </div>
  );
}
