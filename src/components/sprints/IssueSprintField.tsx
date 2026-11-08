"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Sprint } from "@prisma/client";
import type { IssueWithRelations, SprintWithCounts } from "@/types";
import { moveIssueToSprint } from "@/actions/sprint-actions";
import { focusRingClass, nativeSelectClass } from "./sprint-ui";

export interface IssueSprintFieldProps {
  /** Issue with its `sprint` relation loaded (null sprint = backlog). */
  issue: IssueWithRelations;
  /** ACTIVE and PLANNED sprints the issue can move into. */
  sprints: SprintWithCounts[];
  projectId: string;
  /** Called after the issue was moved (null = backlog). */
  onChange: (sprint: Sprint | null) => void;
}

const BACKLOG = "__backlog__";

/**
 * The issue page's sprint picker. Issues archived with a completed sprint are
 * history, so those get a read-only link to the sprint report instead.
 */
export function IssueSprintField({ issue, sprints, projectId, onChange }: IssueSprintFieldProps) {
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (issue.sprint?.status === "COMPLETED") {
    return (
      <Link
        href={`/projects/${projectId}/sprints/${issue.sprint.id}`}
        className={`inline-flex min-h-7 max-w-full items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 hover:underline dark:bg-green-500/15 dark:text-green-300 ${focusRingClass}`}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="truncate">Completed in {issue.sprint.name}</span>
      </Link>
    );
  }

  const options = sprints.filter((sprint) => sprint.status !== "COMPLETED");
  const currentValue = issue.sprintId ?? BACKLOG;

  const handleChange = (value: string) => {
    if (value === currentValue) return;
    const sprintId = value === BACKLOG ? null : value;
    setError(null);
    setPendingValue(value);
    startTransition(async () => {
      const result = await moveIssueToSprint(issue.id, sprintId);
      setPendingValue(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onChange(sprintId ? (options.find((sprint) => sprint.id === sprintId) ?? null) : null);
    });
  };

  return (
    <>
      <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Sprint</span>
        <select
          value={pendingValue ?? currentValue}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isPending}
          aria-busy={isPending}
          className={`${nativeSelectClass} h-9 max-w-[12rem] pl-2 pr-1 text-xs sm:h-7`}
        >
          <option value={BACKLOG}>Backlog</option>
          {options.map((sprint) => (
            <option key={sprint.id} value={sprint.id}>
              {sprint.name}
              {sprint.status === "ACTIVE" ? " (active)" : ""}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="basis-full text-xs text-destructive">
          {error}
        </p>
      )}
    </>
  );
}
