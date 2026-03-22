"use client";

import { IssueStatus } from "@prisma/client";
import { Column } from "./Column";
import type { IssueWithRelations } from "@/types";

const COLUMNS: { status: IssueStatus; label: string }[] = [
  { status: "OPEN", label: "Open" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "REVIEW", label: "Review" },
  { status: "DONE", label: "Done" },
];

interface BoardProps {
  issues: IssueWithRelations[];
}

export function Board({ issues }: BoardProps) {
  const issuesByStatus = COLUMNS.map((col) => ({
    ...col,
    issues: issues.filter((issue) => issue.status === col.status),
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
          />
        ))}
      </div>
    </div>
  );
}