"use client";

import Link from "next/link";
import type { SprintStatus } from "@prisma/client";
import type { OverviewEpic, OverviewIssue } from "@/lib/overview";
import { STATUS_DOT_CLASSES } from "@/components/board/columns";
import { ProgressBar } from "@/components/sprints/ProgressBar";
import {
  chipClass,
  focusRingClass,
  ISSUE_STATUS_ORDER,
  issueStatusLabel,
  pluralize,
  priorityClass,
  priorityLabel,
  sprintStatusClass,
} from "@/components/sprints/sprint-ui";
import { toggleExpanded } from "./expanded-state";

/** An epic's DONE list is cut to this many when it would be longer than one more. */
const DONE_PREVIEW = 3;

const sprintStateWord: Record<SprintStatus, string> = {
  ACTIVE: "active",
  PLANNED: "planned",
  COMPLETED: "completed",
};

export function showAllDoneKey(rowKey: string): string {
  return `done:${rowKey}`;
}

/** DOM id prefix for a row (keys may contain ":"). */
function rowDomId(rowKey: string): string {
  return `overview-${rowKey.replace(/[^\w-]/g, "-")}`;
}

interface EpicRowProps {
  epic: OverviewEpic;
  expanded: boolean;
  showAllDone: boolean;
}

/**
 * One epic (or a project's "No epic" bucket): progress and status breakdown
 * at a glance; the whole header toggles its issues, grouped by status.
 */
export function EpicRow({ epic, expanded, showAllDone }: EpicRowProps) {
  const domId = rowDomId(epic.key);
  const nameId = `${domId}-name`;
  const projectChipId = `${domId}-project`;
  const statsId = `${domId}-stats`;
  const panelId = `${domId}-issues`;
  const hasIssues = epic.total > 0;
  const percent = hasIssues ? Math.round((epic.done / epic.total) * 100) : 0;

  const header = (
    <>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex min-w-0 max-w-full items-center gap-2">
          {epic.color ? (
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: epic.color }}
            />
          ) : (
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-muted-foreground"
            />
          )}
          <span
            id={nameId}
            className={`min-w-0 text-sm font-semibold [overflow-wrap:anywhere] ${
              epic.color ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {epic.name}
          </span>
        </span>
        <span
          id={projectChipId}
          className={`${chipClass} rounded-full bg-muted font-normal text-muted-foreground ring-1 ring-inset ring-border [overflow-wrap:anywhere]`}
        >
          {epic.projectName}
        </span>
        {epic.inCurrentSprint > 0 && (
          <span className={`${chipClass} rounded-full bg-primary/10 text-primary`}>
            {epic.inCurrentSprint} in current sprint
          </span>
        )}
      </span>

      <span id={statsId} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
        {hasIssues ? (
          <>
            <span className="flex items-center gap-2 sm:shrink-0">
              <ProgressBar
                value={epic.done}
                max={epic.total}
                label={`${epic.name} progress`}
                className="flex-1 sm:w-28 sm:flex-none"
              />
              <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground sm:w-24">
                <span className="font-medium text-foreground">
                  {epic.done}/{epic.total}
                </span>{" "}
                done · {percent}%
              </span>
            </span>
            <span className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:flex sm:flex-wrap sm:gap-x-4">
              {ISSUE_STATUS_ORDER.map((status) => {
                const count = epic.counts[status];
                return (
                  <span
                    key={status}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap ${
                      count > 0 ? "text-foreground" : "text-muted-foreground opacity-70"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASSES[status]}`}
                    />
                    <span className="font-semibold tabular-nums">{count}</span>
                    {issueStatusLabel[status]}
                  </span>
                );
              })}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">No issues yet</span>
        )}
      </span>
    </>
  );

  if (!hasIssues) {
    // Nothing to expand: same anatomy, without the toggle.
    return (
      <li className="flex gap-3 px-3 py-3 sm:px-4">
        <span aria-hidden="true" className="h-5 w-5 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">{header}</div>
      </li>
    );
  }

  return (
    <li>
      <h4>
        <button
          type="button"
          onClick={() => toggleExpanded(epic.key)}
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-labelledby={`${nameId} ${projectChipId}`}
          aria-describedby={statsId}
          className="flex w-full gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className={`mt-px h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none ${
              expanded ? "rotate-90" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span className="flex min-w-0 flex-1 flex-col gap-2">{header}</span>
        </button>
      </h4>

      <div id={panelId} hidden={!expanded} className="px-3 pb-3 sm:pr-4 sm:pl-12">
        {expanded && <EpicIssues epic={epic} showAllDone={showAllDone} />}
      </div>
    </li>
  );
}

function EpicIssues({ epic, showAllDone }: { epic: OverviewEpic; showAllDone: boolean }) {
  const boardHref =
    epic.epicId && epic.inCurrentSprint > 0
      ? `/projects/${epic.projectId}/board?epic=${encodeURIComponent(epic.epicId)}`
      : null;

  return (
    <div className="flex flex-col gap-3">
      {ISSUE_STATUS_ORDER.map((status) => {
        const issues = epic.issues.filter((issue) => issue.status === status);
        if (issues.length === 0) return null;

        const collapsible = status === "DONE" && issues.length > DONE_PREVIEW + 1;
        const shown = collapsible && !showAllDone ? issues.slice(0, DONE_PREVIEW) : issues;
        const listId = `${rowDomId(epic.key)}-${status.toLowerCase()}`;

        return (
          <div key={status}>
            <h5 className="flex items-center gap-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASSES[status]}`}
              />
              {issueStatusLabel[status]}
              <span className="font-medium tabular-nums">{issues.length}</span>
            </h5>
            <ul
              id={listId}
              className="divide-y divide-border overflow-hidden rounded-md border border-border bg-background"
            >
              {shown.map((issue) => (
                <IssueLine key={issue.id} issue={issue} />
              ))}
            </ul>
            {collapsible && (
              <button
                type="button"
                onClick={() => toggleExpanded(showAllDoneKey(epic.key))}
                aria-expanded={showAllDone}
                aria-controls={listId}
                className={`mt-1 inline-flex min-h-9 items-center rounded px-1 text-xs font-medium text-primary hover:underline pointer-fine:min-h-7 ${focusRingClass}`}
              >
                {showAllDone
                  ? "Show fewer done"
                  : `Show ${issues.length - DONE_PREVIEW} more done`}
              </button>
            )}
          </div>
        );
      })}

      {boardHref && (
        <Link
          href={boardHref}
          className={`inline-flex min-h-9 items-center self-start rounded px-1 text-xs font-medium text-primary hover:underline pointer-fine:min-h-7 ${focusRingClass}`}
        >
          View {pluralize(epic.inCurrentSprint, "issue")} on the board →
        </Link>
      )}
    </div>
  );
}

function IssueLine({ issue }: { issue: OverviewIssue }) {
  const sprint = issue.sprint;

  return (
    <li className="flex flex-col gap-1 px-3 pt-0.5 pb-2 sm:flex-row sm:items-center sm:gap-3 pointer-fine:py-2">
      <Link
        href={`/projects/${issue.projectId}/issues/${issue.number}`}
        className={`block min-w-0 flex-1 rounded py-2 text-sm font-medium text-foreground [overflow-wrap:anywhere] hover:underline pointer-fine:py-0.5 ${focusRingClass}`}
      >
        <span className="font-normal text-muted-foreground">#{issue.number}</span> {issue.title}
      </Link>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5 sm:shrink-0 sm:flex-nowrap sm:justify-end">
        <span className={`${chipClass} ${priorityClass[issue.priority]}`}>
          {priorityLabel[issue.priority]}
        </span>
        {sprint ? (
          <span
            className={`${chipClass} font-normal [overflow-wrap:anywhere] sm:max-w-[12rem] ${sprintStatusClass[sprint.status]}`}
          >
            {sprint.name} · {sprintStateWord[sprint.status]}
          </span>
        ) : (
          <span className={`${chipClass} bg-muted font-normal text-muted-foreground`}>Backlog</span>
        )}
      </span>
    </li>
  );
}
