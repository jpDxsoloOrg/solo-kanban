import Link from "next/link";
import type { OverviewProject } from "@/lib/overview";
import { DaysLeft } from "@/components/sprints/DaysLeft";
import { ProgressBar } from "@/components/sprints/ProgressBar";
import { focusRingClass } from "@/components/sprints/sprint-ui";

interface ProjectSummaryRowProps {
  projects: OverviewProject[];
}

/**
 * One card per project: active sprint progress and a few counts; each card
 * opens that project's board. A swipeable row on phones, a grid from sm up.
 */
export function ProjectSummaryRow({ projects }: ProjectSummaryRowProps) {
  return (
    <section aria-labelledby="overview-projects-heading">
      <h2
        id="overview-projects-heading"
        className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        Projects
      </h2>
      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
        {projects.map((project) => (
          <li
            key={project.id}
            className="w-[min(17.5rem,calc(100vw-4.5rem))] shrink-0 snap-start sm:w-auto"
          >
            <ProjectCard project={project} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProjectCard({ project }: { project: OverviewProject }) {
  const sprint = project.activeSprint;

  return (
    <Link
      href={`/projects/${project.id}/board`}
      className={`group flex h-full flex-col gap-3 rounded-lg border border-border bg-background p-4 shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/30 ${focusRingClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-base font-semibold text-foreground [overflow-wrap:anywhere] group-hover:underline">
          {project.name}
        </h3>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </div>

      {/* Fixed height so cards line up with and without an active sprint. */}
      <div className="flex min-h-11 flex-col justify-center gap-2">
        {sprint ? (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground [overflow-wrap:anywhere]">
                {sprint.name}
              </span>
              <DaysLeft endDate={sprint.endDate} />
            </p>
            <div className="flex items-center gap-2">
              <ProgressBar
                value={sprint.done}
                max={sprint.total}
                label={`${sprint.name} progress`}
                className="flex-1"
              />
              <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {sprint.done}/{sprint.total} done
              </span>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No active sprint</p>
        )}
      </div>

      <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-border pt-3">
        <Stat label="Open" value={project.openIssues} />
        <Stat label="Backlog" value={project.backlogIssues} />
        <Stat label="Epics" value={project.epicCount} />
      </dl>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="text-lg font-semibold leading-tight tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
