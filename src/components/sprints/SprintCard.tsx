import Link from "next/link";
import type { Sprint } from "@prisma/client";
import { formatSprintRange } from "@/lib/sprint-dates";
import { DaysLeft } from "./DaysLeft";
import { LocalDate } from "./LocalDate";
import { ProgressBar } from "./ProgressBar";
import { chipClass, focusRingClass, pluralize, sprintStatusClass, sprintStatusLabel } from "./sprint-ui";

interface SprintCardProps {
  sprint: Sprint;
  projectId: string;
  totalIssues: number;
  doneIssues: number;
}

/** Sprint summary card on the Sprints page; the whole card opens the report. */
export function SprintCard({ sprint, projectId, totalIssues, doneIssues }: SprintCardProps) {
  const range = formatSprintRange(sprint.startDate, sprint.endDate);
  const isCompleted = sprint.status === "COMPLETED";

  return (
    <Link
      href={`/projects/${projectId}/sprints/${sprint.id}`}
      className={`group flex h-full flex-col gap-2 rounded-lg border border-border bg-background p-4 shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/30 ${focusRingClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-base font-semibold text-foreground [overflow-wrap:anywhere] group-hover:underline">
          {sprint.name}
        </h3>
        <span className={`${chipClass} shrink-0 rounded-full ${sprintStatusClass[sprint.status]}`}>
          {sprintStatusLabel[sprint.status]}
        </span>
      </div>

      <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
        <span>{range || "No dates set"}</span>
        {sprint.status === "ACTIVE" && <DaysLeft endDate={sprint.endDate} />}
        {isCompleted && sprint.completedAt && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              Completed <LocalDate value={sprint.completedAt} />
            </span>
          </>
        )}
      </p>

      {sprint.goal && (
        <p className="line-clamp-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {sprint.goal}
        </p>
      )}

      <div className="mt-auto flex items-center gap-2 pt-1 text-xs text-muted-foreground">
        {isCompleted ? (
          <span>{pluralize(doneIssues, "issue")} completed</span>
        ) : (
          <>
            <ProgressBar
              value={doneIssues}
              max={totalIssues}
              label={`${sprint.name} progress`}
              className="w-20"
            />
            <span className="tabular-nums">
              {doneIssues}/{totalIssues} done
            </span>
          </>
        )}
      </div>
    </Link>
  );
}
