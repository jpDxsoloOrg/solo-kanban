"use client";

import { IssueRow, type IssueRowIssue } from "./IssueRow";

interface ReportIssueListProps {
  issues: IssueRowIssue[];
  /** Every issue in the report (unused now that subtasks never show; kept for callers). */
  all: IssueRowIssue[];
  projectId: string;
}

/** A sprint report's issue list: top-level issues only (subtasks never show here). */
export function ReportIssueList({ issues, projectId }: ReportIssueListProps) {
  const shown = issues.filter((issue) => issue.parentId === null);
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
