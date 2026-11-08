"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Epic, Issue, Sprint } from "@prisma/client";
import { moveIssueToSprint } from "@/actions/sprint-actions";
import {
  chipClass,
  focusRingClass,
  issueStatusClass,
  issueStatusLabel,
  nativeSelectClass,
  priorityClass,
  priorityLabel,
} from "./sprint-ui";

export type IssueRowIssue = Pick<
  Issue,
  "id" | "number" | "title" | "status" | "priority" | "sprintId"
> & {
  epic: Pick<Epic, "name" | "color"> | null;
};

export type MoveTarget = Pick<Sprint, "id" | "name" | "status">;

export interface IssueRowProps {
  issue: IssueRowIssue;
  projectId: string;
  /** Sprints the issue can be moved to. Omit for a read-only row. */
  moveTargets?: MoveTarget[];
}

const BACKLOG = "__backlog__";

/**
 * One issue in a list: number + title (links to the issue page), status,
 * priority, epic, and an optional "Move to" sprint picker. Stacks on phones.
 */
export function IssueRow({ issue, projectId, moveTargets }: IssueRowProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleMove = (value: string) => {
    if (!value) return;
    const sprintId = value === BACKLOG ? null : value;
    setError(null);
    startTransition(async () => {
      const result = await moveIssueToSprint(issue.id, sprintId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Keep the row in its pending state until it re-renders in its new place.
      startTransition(() => router.refresh());
    });
  };

  const otherTargets = moveTargets?.filter((target) => target.id !== issue.sprintId) ?? [];

  return (
    <li className={`px-3 py-2.5 sm:px-4 ${isPending ? "opacity-60" : ""}`}>
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <Link
          href={`/projects/${projectId}/issues/${issue.number}`}
          className={`min-w-0 flex-1 rounded py-0.5 text-sm font-medium text-foreground [overflow-wrap:anywhere] hover:underline ${focusRingClass}`}
        >
          <span className="font-normal text-muted-foreground">#{issue.number}</span>{" "}
          {issue.title}
        </Link>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:flex-nowrap sm:justify-end">
          <span className={`${chipClass} ${issueStatusClass[issue.status]}`}>
            {issueStatusLabel[issue.status]}
          </span>
          <span className={`${chipClass} ${priorityClass[issue.priority]}`}>
            {priorityLabel[issue.priority]}
          </span>
          {issue.epic && (
            <span
              className={`${chipClass} gap-1 font-normal sm:max-w-[10rem]`}
              style={{ backgroundColor: `${issue.epic.color}20`, color: issue.epic.color }}
              title={issue.epic.name}
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: issue.epic.color }}
              />
              <span className="truncate">{issue.epic.name}</span>
            </span>
          )}

          {moveTargets && (
            <select
              value=""
              onChange={(e) => handleMove(e.target.value)}
              disabled={isPending}
              aria-label={`Move #${issue.number} to`}
              className={`${nativeSelectClass} ml-auto h-9 w-[6.75rem] shrink-0 pl-2 pr-1 text-xs sm:ml-1 sm:h-8 sm:w-32`}
            >
              <option value="" disabled>
                {isPending ? "Moving…" : "Move to…"}
              </option>
              {issue.sprintId !== null && <option value={BACKLOG}>Backlog</option>}
              {otherTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                  {target.status === "ACTIVE" ? " (active)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}
