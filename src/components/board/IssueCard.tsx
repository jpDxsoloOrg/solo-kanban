import type { IssueWithRelations } from "@/types";

export function IssueCard({ issue }: { issue: IssueWithRelations }) {
  return (
    <div className="p-2 bg-white rounded border text-sm">{issue.title}</div>
  );
}