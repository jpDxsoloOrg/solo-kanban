"use client";

// STUB — replaced by the sprints UI track.
import type { Sprint } from "@prisma/client";
import type { IssueWithRelations, SprintWithCounts } from "@/types";

export interface IssueSprintFieldProps {
  /** Issue with its `sprint` relation loaded (null sprint = backlog). */
  issue: IssueWithRelations;
  /** ACTIVE and PLANNED sprints the issue can move into. */
  sprints: SprintWithCounts[];
  projectId: string;
  /** Called after the issue was moved (null = backlog). */
  onChange: (sprint: Sprint | null) => void;
}

export function IssueSprintField({ issue }: IssueSprintFieldProps) {
  return (
    <span className="text-xs text-muted-foreground">
      {issue.sprint ? issue.sprint.name : "Backlog"}
    </span>
  );
}
