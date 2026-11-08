import Link from "next/link";
import type { IssuePriority, Sprint } from "@prisma/client";
import { daysRemaining, formatSprintRangeWithYear, toDateInputValue } from "@/lib/sprint-dates";
import { DaysLeft } from "./DaysLeft";
import { IssueRow, type IssueRowIssue } from "./IssueRow";
import { LocalDate } from "@/components/common/LocalDate";
import { ProgressBar } from "./ProgressBar";
import {
  chipClass,
  focusRingClass,
  ISSUE_STATUS_ORDER,
  issueStatusLabel,
  pluralize,
  PRIORITY_ORDER,
  priorityBarClass,
  priorityLabel,
  sprintStatusClass,
  sprintStatusLabel,
} from "./sprint-ui";

export type ReportIssue = IssueRowIssue & { epicId: string | null };

interface SprintReportProps {
  sprint: Sprint;
  projectId: string;
  /** Issues attached to the sprint (for completed sprints: the DONE work archived with it). */
  issues: ReportIssue[];
}

interface BreakdownRow {
  key: string;
  label: string;
  color?: string;
  barClass?: string;
  total: number;
  done: number;
}

/** Read-only summary of a sprint: dates, goal, stats, breakdowns and its issues. */
export function SprintReport({ sprint, projectId, issues }: SprintReportProps) {
  const isCompleted = sprint.status === "COMPLETED";
  const total = issues.length;
  const done = issues.filter((issue) => issue.status === "DONE").length;
  const range = formatSprintRangeWithYear(sprint.startDate, sprint.endDate);
  const lengthDays =
    sprint.startDate && sprint.endDate
      ? daysRemaining(sprint.endDate, toDateInputValue(sprint.startDate))
      : null;

  const epicRows = breakdownByEpic(issues);
  const priorityRows: BreakdownRow[] = PRIORITY_ORDER.map((priority: IssuePriority) => {
    const matching = issues.filter((issue) => issue.priority === priority);
    return {
      key: priority,
      label: priorityLabel[priority],
      barClass: priorityBarClass[priority],
      total: matching.length,
      done: matching.filter((issue) => issue.status === "DONE").length,
    };
  }).filter((row) => row.total > 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 pb-16 pt-2 sm:px-6">
        <nav aria-label="Breadcrumb">
          <Link
            href={`/projects/${projectId}/sprints`}
            className={`inline-flex min-h-9 items-center rounded text-sm text-muted-foreground hover:text-foreground hover:underline ${focusRingClass}`}
          >
            ← All sprints
          </Link>
        </nav>

        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold leading-tight text-foreground [overflow-wrap:anywhere]">
                  {sprint.name}
                </h1>
                <span className={`${chipClass} rounded-full ${sprintStatusClass[sprint.status]}`}>
                  {sprintStatusLabel[sprint.status]}
                </span>
              </div>
              <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                <span className="whitespace-nowrap">{range || "No dates set"}</span>
                {sprint.status === "ACTIVE" && (
                  <>
                    <span aria-hidden="true">·</span>
                    <DaysLeft endDate={sprint.endDate} />
                  </>
                )}
                {isCompleted && sprint.completedAt && (
                  <>
                    {/* On phones the completion date gets its own line. */}
                    <span aria-hidden="true" className="hidden sm:inline">·</span>
                    <span className="basis-full whitespace-nowrap sm:basis-auto">
                      Completed <LocalDate date={sprint.completedAt} />
                    </span>
                  </>
                )}
              </p>
            </div>
            {sprint.status === "ACTIVE" && (
              <HeaderLink href={`/projects/${projectId}/board`}>Open board</HeaderLink>
            )}
            {sprint.status === "PLANNED" && (
              <HeaderLink href={`/projects/${projectId}/backlog`}>Plan in backlog</HeaderLink>
            )}
          </div>

          {sprint.goal && (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Goal
              </h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground [overflow-wrap:anywhere]">
                {sprint.goal}
              </p>
            </div>
          )}
        </header>

        <section aria-labelledby="report-stats-heading">
          <h2 id="report-stats-heading" className="sr-only">
            Stats
          </h2>
          <dl className="grid grid-cols-3 gap-2 sm:gap-3">
            {isCompleted ? (
              <>
                <Stat label="Issues completed" value={String(done)} />
                <Stat label="Sprint length" value={lengthDays === null ? "—" : pluralize(lengthDays, "day")} />
                <Stat label="Epics" value={String(epicRows.filter((r) => r.key !== "none").length)} />
              </>
            ) : (
              <>
                <Stat label="Done" value={`${done}/${total}`}>
                  <ProgressBar value={done} max={total} label={`${sprint.name} progress`} className="mt-2" />
                </Stat>
                <Stat label="Remaining" value={String(total - done)} />
                <Stat label="Sprint length" value={lengthDays === null ? "—" : pluralize(lengthDays, "day")} />
              </>
            )}
          </dl>
        </section>

        {total > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Breakdown title="By epic" rows={epicRows} showDone={!isCompleted} />
            <Breakdown title="By priority" rows={priorityRows} showDone={!isCompleted} />
          </div>
        )}

        <section aria-labelledby="report-issues-heading" className="flex flex-col gap-3">
          <h2 id="report-issues-heading" className="text-base font-semibold text-foreground">
            {isCompleted ? "Completed issues" : "Issues"}{" "}
            <span className="font-normal text-muted-foreground">({total})</span>
          </h2>
          {total === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              {isCompleted
                ? "No issues were completed in this sprint."
                : "No issues in this sprint yet. Add some from the backlog."}
            </p>
          ) : isCompleted ? (
            <IssueList issues={issues} projectId={projectId} />
          ) : (
            ISSUE_STATUS_ORDER.map((status) => {
              const group = issues.filter((issue) => issue.status === status);
              if (group.length === 0) return null;
              return (
                <div key={status}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {issueStatusLabel[status]} · {group.length}
                  </h3>
                  <IssueList issues={group} projectId={projectId} />
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-9 shrink-0 items-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted ${focusRingClass}`}
    >
      {children}
    </Link>
  );
}

function Stat({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background px-3 py-3 sm:px-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-foreground sm:text-xl">{value}</dd>
      {children}
    </div>
  );
}

function Breakdown({ title, rows, showDone }: { title: string; rows: BreakdownRow[]; showDone: boolean }) {
  const max = Math.max(1, ...rows.map((row) => row.total));
  return (
    <section className="rounded-lg border border-border bg-background px-4 py-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${row.barClass ?? ""}`}
                  style={row.color ? { backgroundColor: row.color } : undefined}
                />
                <span className="truncate text-foreground">{row.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {showDone ? `${row.done}/${row.total} done` : row.total}
              </span>
            </div>
            <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${row.barClass ?? ""}`}
                style={{
                  width: `${Math.round(((showDone ? row.done : row.total) / (showDone ? row.total || 1 : max)) * 100)}%`,
                  ...(row.color && { backgroundColor: row.color }),
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function IssueList({ issues, projectId }: { issues: ReportIssue[]; projectId: string }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
      {issues.map((issue) => (
        <IssueRow key={issue.id} issue={issue} projectId={projectId} />
      ))}
    </ul>
  );
}

function breakdownByEpic(issues: ReportIssue[]): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();
  for (const issue of issues) {
    const key = issue.epicId ?? "none";
    const row =
      rows.get(key) ??
      ({
        key,
        label: issue.epic?.name ?? "No epic",
        color: issue.epic?.color,
        barClass: issue.epic ? undefined : "bg-gray-400",
        total: 0,
        done: 0,
      } satisfies BreakdownRow);
    row.total += 1;
    if (issue.status === "DONE") row.done += 1;
    rows.set(key, row);
  }
  // Largest first; "No epic" last.
  return [...rows.values()].sort((a, b) =>
    a.key === "none" ? 1 : b.key === "none" ? -1 : b.total - a.total,
  );
}
