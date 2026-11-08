import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { Board } from "@/components/board/Board";
import { NoActiveSprint } from "@/components/sprints/NoActiveSprint";
import { getProjects } from "@/actions/project-actions";

interface BoardPageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ epic?: string }>;
}

export default async function BoardPage({ params, searchParams }: BoardPageProps) {
  const { projectId } = await params;
  const { epic: epicFilter } = await searchParams;

  const [projects, project, activeSprint, plannedSprints, backlogCount] = await Promise.all([
    getProjects(),
    prisma.project.findUnique({
      where: { id: projectId },
      include: { epics: true },
    }),
    prisma.sprint.findFirst({
      where: { projectId, status: "ACTIVE" },
    }),
    prisma.sprint.findMany({
      where: { projectId, status: "PLANNED" },
      include: { _count: { select: { issues: true } } },
      orderBy: { number: "asc" },
    }),
    prisma.issue.count({ where: { projectId, sprintId: null } }),
  ]);

  if (!project) notFound();

  // The board shows the active sprint. The epic filter is applied on the
  // client so sprint progress and column positions use the full sprint.
  const issues = activeSprint
    ? await prisma.issue.findMany({
        where: { projectId, sprintId: activeSprint.id },
        include: {
          epic: true,
          subtasks: true,
          _count: { select: { comments: true } },
        },
        orderBy: { order: "asc" },
      })
    : [];

  return (
    <AppShell
      sidebar={
        <Sidebar
          projectId={projectId}
          projects={projects}
          epics={project.epics}
          epicFilter={epicFilter ?? null}
        />
      }
    >
      {activeSprint ? (
        <Board
          key={JSON.stringify(issues.map((i) => i.id + i.status + i.order))}
          issues={issues}
          projectId={projectId}
          epics={project.epics}
          epicFilter={epicFilter ?? null}
          sprint={activeSprint}
          plannedSprints={plannedSprints}
        />
      ) : (
        <NoActiveSprint
          projectId={projectId}
          plannedSprints={plannedSprints}
          backlogCount={backlogCount}
        />
      )}
    </AppShell>
  );
}
