import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { SprintReport } from "@/components/sprints/SprintReport";
import { getProjects } from "@/actions/project-actions";

interface SprintReportPageProps {
  params: Promise<{ projectId: string; sprintId: string }>;
}

export default async function SprintReportPage({ params }: SprintReportPageProps) {
  const { projectId, sprintId } = await params;

  const [projects, project, sprint] = await Promise.all([
    getProjects(),
    prisma.project.findUnique({
      where: { id: projectId },
      include: { epics: true },
    }),
    prisma.sprint.findUnique({
      where: { id: sprintId },
      include: {
        issues: {
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            priority: true,
            sprintId: true,
            epicId: true,
            epic: { select: { name: true, color: true } },
          },
          // Postgres sorts the IssueStatus enum in declaration order.
          orderBy: [{ status: "asc" }, { order: "asc" }, { number: "asc" }],
        },
      },
    }),
  ]);

  if (!project || !sprint || sprint.projectId !== projectId) notFound();

  const { issues, ...sprintFields } = sprint;

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
      <SprintReport sprint={sprintFields} projectId={projectId} issues={issues} />
    </AppShell>
  );
}
