"use client";

import { IssueStatus } from "@prisma/client";
import { IssueCard } from "./IssueCard";
import type { IssueWithRelations } from "@/types";

interface ColumnProps {
  status: IssueStatus;
  label: string;
  issues: IssueWithRelations[];
}

const statusColors: Record<IssueStatus, string> = {
  OPEN: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  REVIEW: "bg-amber-100 text-amber-700",
  DONE: "bg-green-100 text-green-700",
};

export function Column({ status, label, issues }: ColumnProps) {
  return (
    <div className="flex flex-col h-full min-h-0 rounded-lg bg-gray-50">
      {/* Column header: sticky, never scrolls */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColors[status]}`}
          >
            {label}
          </span>
          <span className="text-xs text-gray-400">{issues.length}</span>
        </div>
      </div>

      {/* Card list: scrollable */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {issues.map((issue) => (
          <IssueCard key={issue.id} issue={issue} />
        ))}

        {issues.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">
            No issues
          </p>
        )}
      </div>
    </div>
  );
}