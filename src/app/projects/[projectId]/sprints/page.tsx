import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import type { SprintStatus } from "@prisma/client";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { NewSprintButton } from "@/components/sprints/NewSprintButton";
import { SprintCard } from "@/components/sprints/SprintCard";
import { getProjects } from "@/actions/project-actions";
import { getSprints } from "@/actions/sprint-actions";
import type { SprintWithCounts } from "@/types";

interface SprintsPageProps {
  params: Promise<{ projectId: string }>;
}

const GROUPS: { status: SprintStatus; title: string; empty: string }[] = [
  { status: "ACTIVE", title: "Active", empty: "No sprint is running." },
  { status: "PLANNED", title: "Planned", empty: "Nothing planned yet." },
  { status: "COMPLETED", title: "Completed", empty: "No sprints completed yet." },
];

function newestCompletedFirst(a: SprintWithCounts, b: SprintWithCounts) {
  const byDate = (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0);
  return byDate || b.number - a.number;
}

export default async function SprintsPage({ params }: SprintsPageProps) {
  const { projectId } = await params;

  const [projects, project, sprints, doneCounts] = await Promise.all([
    getProjects(),
    prisma.project.findUnique({
      where: { id: projectId },
      include: { epics: true },
    }),
    getSprints(projectId),
    prisma.issue.groupBy({
      by: ["sprintId"],
      where: { projectId, status: "DONE", sprintId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  if (!project) notFound();

  const doneBySprint = new Map(doneCounts.map((row) => [row.sprintId, row._count._all]));

  return (
    <AppShell
      sidebar={
        <Sidebar
          projectId={projectId}
          projects={projects}
          epics={project.epics}
          epicFilter={null}
        />
      }
    >
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pb-16 pt-2 sm:px-6">
          <header>
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-xl font-semibold text-foreground">Sprints</h1>
              <NewSprintButton projectId={projectId} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
              Every sprint in {project.name}. Open one to see its report.
            </p>
          </header>

          {GROUPS.map((group) => {
            const groupSprints = sprints.filter((s) => s.status === group.status);
            if (group.status === "COMPLETED") groupSprints.sort(newestCompletedFirst);
            const headingId = `sprints-${group.status.toLowerCase()}`;

            return (
              <section key={group.status} aria-labelledby={headingId}>
                <h2
                  id={headingId}
                  className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {group.title}
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
                    {groupSprints.length}
                  </span>
                </h2>
                {groupSprints.length > 0 ? (
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {groupSprints.map((sprint) => (
                      <li key={sprint.id}>
                        <SprintCard
                          sprint={sprint}
                          projectId={projectId}
                          totalIssues={sprint._count.issues}
                          doneIssues={doneBySprint.get(sprint.id) ?? 0}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                    {group.empty}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
