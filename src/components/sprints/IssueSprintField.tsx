"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@dxsolo/ui";
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
 *
 * Picking a sprint only selects it; the Move button next to the picker
 * moves the issue. A native select changes value on arrow keys while closed
 * (Windows, Linux), so acting on every change would move the issue as soon
 * as a keyboard user looks through the options.
 */
export function IssueSprintField({ issue, sprints, projectId, onChange }: IssueSprintFieldProps) {
  // The picked (not yet moved to) sprint; null shows the current one.
  const [choice, setChoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectRef = useRef<HTMLSelectElement>(null);
  const moveButtonRef = useRef<HTMLButtonElement>(null);

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
  // Ignore a pick that a refresh made moot (already there, or sprint gone).
  const chosen =
    choice !== null &&
    choice !== currentValue &&
    (choice === BACKLOG || options.some((sprint) => sprint.id === choice))
      ? choice
      : null;
  const chosenLabel =
    chosen === BACKLOG ? "Backlog" : options.find((sprint) => sprint.id === chosen)?.name;

  const handleMove = () => {
    if (chosen === null || isPending) return;
    const sprintId = chosen === BACKLOG ? null : chosen;
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof moveIssueToSprint>>;
      try {
        result = await moveIssueToSprint(issue.id, sprintId);
      } catch (err) {
        // Offline, server down, or a stale tab after a deploy. Thrown out of
        // the transition it would replace the page with the error screen.
        console.error("Failed to move issue:", err);
        result = { ok: false, error: "Couldn't move the issue. Check your connection and try again." };
      }
      if (!result.ok) {
        // The pick stays, so Move retries it.
        setError(result.error);
        return;
      }
      setChoice(null);
      onChange(sprintId ? (options.find((sprint) => sprint.id === sprintId) ?? null) : null);
      // The Move button goes away; keep keyboard focus on the picker.
      if (document.activeElement === moveButtonRef.current) selectRef.current?.focus();
    });
  };

  return (
    <>
      <span className="inline-flex items-center gap-1.5">
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Sprint</span>
          <select
            ref={selectRef}
            value={chosen ?? currentValue}
            onChange={(e) => {
              if (isPending) return;
              setChoice(e.target.value);
              setError(null);
            }}
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
        {chosen !== null && (
          <Button
            ref={moveButtonRef}
            type="button"
            intent="primary"
            size="sm"
            // aria-disabled, not disabled, so focus stays on the button.
            aria-disabled={isPending || undefined}
            aria-label={`Move to ${chosenLabel}`}
            onClick={handleMove}
            className="h-9 shrink-0 px-3 sm:h-7"
          >
            {isPending ? "Moving…" : "Move"}
          </Button>
        )}
      </span>
      {error && (
        <p role="alert" className="basis-full text-xs text-destructive">
          {error}
        </p>
      )}
    </>
  );
}
