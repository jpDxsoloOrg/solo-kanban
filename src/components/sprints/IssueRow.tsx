"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@dxsolo/ui";
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
 *
 * Picking a target only selects it; the Move button next to the picker
 * moves the issue. A native select changes value on arrow keys while closed
 * (Windows, Linux), so acting on every change would move the issue as soon
 * as a keyboard user looks through the options.
 */
export function IssueRow({ issue, projectId, moveTargets }: IssueRowProps) {
  const router = useRouter();
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const rowRef = useRef<HTMLLIElement>(null);

  // A move takes the row out of this list (it re-renders in its new
  // section). If it had focus, hand focus to a neighbouring row's picker, or
  // the section, instead of dropping it on <body>. Layout cleanups run while
  // the row is still in the document; the focus waits a frame so a page
  // that's going away (navigation) is left alone.
  useLayoutEffect(() => {
    const row = rowRef.current;
    return () => {
      if (!row || !row.contains(document.activeElement)) return;
      const neighbour = row.nextElementSibling ?? row.previousElementSibling;
      const target =
        neighbour?.querySelector<HTMLElement>("select:not(:disabled)") ??
        row
          .closest("section")
          ?.querySelector<HTMLElement>("a[href], input:not(:disabled), button:not(:disabled)");
      requestAnimationFrame(() => {
        const focusLost = document.activeElement === null || document.activeElement === document.body;
        if (target?.isConnected && focusLost) target.focus();
      });
    };
  }, []);

  const otherTargets = moveTargets?.filter((target) => target.id !== issue.sprintId) ?? [];
  const options = [
    ...(issue.sprintId !== null ? [{ value: BACKLOG, label: "Backlog" }] : []),
    ...otherTargets.map((target) => ({
      value: target.id,
      label: `${target.name}${target.status === "ACTIVE" ? " (active)" : ""}`,
    })),
  ];
  // A refresh may have removed the picked sprint.
  const chosen = options.find((option) => option.value === choice);

  const handleMove = () => {
    if (!chosen || isPending) return;
    const sprintId = chosen.value === BACKLOG ? null : chosen.value;
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
      // Keep the row in its pending state until it re-renders in its new place.
      startTransition(() => router.refresh());
    });
  };

  return (
    <li ref={rowRef} className={`px-3 py-2.5 sm:px-4 ${isPending ? "opacity-60" : ""}`}>
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
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-1">
              <select
                value={chosen?.value ?? ""}
                onChange={(e) => {
                  if (isPending) return;
                  setChoice(e.target.value);
                  setError(null);
                }}
                aria-label={`Move #${issue.number} to`}
                className={`${nativeSelectClass} h-9 w-[6.75rem] shrink-0 pl-2 pr-1 text-xs sm:h-8 sm:w-32`}
              >
                <option value="">Move to…</option>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {chosen && (
                <Button
                  type="button"
                  intent="primary"
                  size="sm"
                  // aria-disabled, not disabled, so focus stays on the button.
                  aria-disabled={isPending || undefined}
                  aria-label={`Move #${issue.number} to ${chosen.label}`}
                  onClick={handleMove}
                  className="h-9 shrink-0 px-3 sm:h-8"
                >
                  {isPending ? "Moving…" : "Move"}
                </Button>
              )}
            </div>
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
