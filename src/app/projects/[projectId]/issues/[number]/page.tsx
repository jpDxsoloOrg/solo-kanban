import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { getProjects } from "@/actions/project-actions";
import { IssueView } from "@/components/board/IssueView";

interface IssuePageProps {
  params: Promise<{ projectId: string; number: string }>;
}

export default async function IssuePage({ params }: IssuePageProps) {
  const { projectId, number } = await params;
  const numericNumber = Number.parseInt(number, 10);
  if (!Number.isFinite(numericNumber)) notFound();

  const [projects, project, issue] = await Promise.all([
    getProjects(),
    prisma.project.findUnique({
      where: { id: projectId },
      include: { epics: true },
    }),
    prisma.issue.findUnique({
      where: { projectId_number: { projectId, number: numericNumber } },
      include: {
        epic: true,
        subtasks: { orderBy: { order: "asc" } },
      },
    }),
  ]);

  if (!project || !issue) notFound();

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
      <IssueView issue={issue} projectId={projectId} />
    </AppShell>
  );
}
