import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { BacklogView } from "@/components/sprints/BacklogView";
import { getProjects } from "@/actions/project-actions";

interface BacklogPageProps {
  params: Promise<{ projectId: string }>;
}

// Postgres sorts the IssueStatus enum in declaration order (Open → Done).
const issueOrder = [{ status: "asc" as const }, { order: "asc" as const }, { number: "asc" as const }];

// Only what an issue row shows; keeps descriptions out of the client payload.
const issueRowSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  priority: true,
  sprintId: true,
  epic: { select: { name: true, color: true } },
} as const;

// The backlog page plans remaining work: finished issues stay on the board
// and sprint pages, and are only counted here.
const notDone = { status: { not: "DONE" as const } };

export default async function BacklogPage({ params }: BacklogPageProps) {
  const { projectId } = await params;

  const [projects, project, sprints, backlogIssues, doneCounts] = await Promise.all([
    getProjects(),
    prisma.project.findUnique({
      where: { id: projectId },
      include: { epics: true },
    }),
    prisma.sprint.findMany({
      where: { projectId, status: { in: ["ACTIVE", "PLANNED"] } },
      include: { issues: { where: notDone, select: issueRowSelect, orderBy: issueOrder } },
      orderBy: { number: "asc" },
    }),
    prisma.issue.findMany({
      where: { projectId, sprintId: null, ...notDone },
      select: issueRowSelect,
      orderBy: issueOrder,
    }),
    // DONE issues per sprint (null = backlog).
    prisma.issue.groupBy({
      by: ["sprintId"],
      where: { projectId, status: "DONE" },
      _count: { _all: true },
    }),
  ]);

  const doneIn = (sprintId: string | null) =>
    doneCounts.find((row) => row.sprintId === sprintId)?._count._all ?? 0;
  const withDone = sprints.map((sprint) => ({ ...sprint, doneCount: doneIn(sprint.id) }));

  if (!project) notFound();

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
      <BacklogView
        projectId={projectId}
        activeSprint={withDone.find((s) => s.status === "ACTIVE") ?? null}
        plannedSprints={withDone.filter((s) => s.status === "PLANNED")}
        backlogIssues={backlogIssues}
        backlogDoneCount={doneIn(null)}
      />
    </AppShell>
  );
}
