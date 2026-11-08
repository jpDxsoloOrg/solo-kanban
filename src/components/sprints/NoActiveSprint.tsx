"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@dxsolo/ui";
import type { SprintWithCounts } from "@/types";
import { formatSprintRange } from "@/lib/sprint-dates";
import { StartSprintDialog } from "./StartSprintDialog";
import { focusRingClass, pluralize } from "./sprint-ui";

export interface NoActiveSprintProps {
  projectId: string;
  /** Planned sprints that could be started. */
  plannedSprints: SprintWithCounts[];
  /** Number of issues in the backlog (sprintId = null). */
  backlogCount: number;
}

/** The board's empty state when no sprint is active. */
export function NoActiveSprint({ projectId, plannedSprints, backlogCount }: NoActiveSprintProps) {
  // undefined = closed, null = start a brand-new sprint, otherwise that sprint.
  const [starting, setStarting] = useState<SprintWithCounts | null | undefined>(undefined);
  const hasPlanned = plannedSprints.length > 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-xl flex-col px-4 pb-12 pt-6 sm:pt-12">
        <div className="text-center">
          <div
            aria-hidden="true"
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3.5" y="5" width="17" height="15" rx="2" />
              <path d="M3.5 9.5h17M8 3v4M16 3v4" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-foreground">No active sprint</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Finished work is archived with its sprint. Start a sprint to put work back on the
            board.
          </p>
        </div>

        {hasPlanned ? (
          <section aria-labelledby="planned-sprints-heading" className="mt-8">
            <h2
              id="planned-sprints-heading"
              className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Planned sprints
            </h2>
            <ul className="flex flex-col gap-3">
              {plannedSprints.map((sprint) => {
                const range = formatSprintRange(sprint.startDate, sprint.endDate);
                return (
                  <li
                    key={sprint.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 sm:p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">
                        {sprint.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {pluralize(sprint._count.issues, "issue")}
                        {range && ` · ${range}`}
                      </p>
                      {sprint.goal && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                          {sprint.goal}
                        </p>
                      )}
                    </div>
                    <Button
                      intent="primary"
                      size="sm"
                      className="h-9 shrink-0"
                      onClick={() => setStarting(sprint)}
                      aria-label={`Start ${sprint.name}`}
                    >
                      Start
                    </Button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 text-center">
              <Button intent="ghost" size="sm" className="h-9" onClick={() => setStarting(null)}>
                Or start a new sprint
              </Button>
            </div>
          </section>
        ) : (
          <div className="mt-8 flex justify-center">
            <Button intent="primary" onClick={() => setStarting(null)}>
              Start a new sprint
            </Button>
          </div>
        )}

        <nav
          aria-label="Planning"
          className="mt-8 flex flex-col items-center gap-1 border-t border-border pt-6 text-sm sm:flex-row sm:justify-center sm:gap-6"
        >
          <Link
            href={`/projects/${projectId}/backlog`}
            className={`inline-flex min-h-9 items-center rounded px-2 font-medium text-primary hover:underline ${focusRingClass}`}
          >
            Backlog · {pluralize(backlogCount, "issue")}
          </Link>
          <Link
            href={`/projects/${projectId}/sprints`}
            className={`inline-flex min-h-9 items-center rounded px-2 text-muted-foreground hover:text-foreground hover:underline ${focusRingClass}`}
          >
            All sprints
          </Link>
        </nav>
      </div>

      <StartSprintDialog
        open={starting !== undefined}
        onClose={() => setStarting(undefined)}
        projectId={projectId}
        sprint={starting ?? null}
      />
    </div>
  );
}
