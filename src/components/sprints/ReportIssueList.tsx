"use client";

import { IssueRow, type IssueRowIssue } from "./IssueRow";
import { useShowSubtasks, visibleIssues } from "@/components/board/subtask-visibility";

interface ReportIssueListProps {
  issues: IssueRowIssue[];
  /** Every issue in the report, to tell whether a subtask's parent is listed. */
  all: IssueRowIssue[];
  projectId: string;
}

/** A sprint report's issue list, following the "Show subtasks" setting. */
export function ReportIssueList({ issues, all, projectId }: ReportIssueListProps) {
  const shown = visibleIssues(issues, useShowSubtasks(), all);
  if (shown.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        Only subtasks here. Turn on “Show subtasks” to list them.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
      {shown.map((issue) => (
        <IssueRow key={issue.id} issue={issue} projectId={projectId} />
      ))}
    </ul>
  );
}
