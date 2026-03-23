import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { Board } from "@/components/board/Board";
import { getProjects } from "@/actions/project-actions";

interface BoardPageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ epic?: string }>;
}

export default async function BoardPage({ params, searchParams }: BoardPageProps) {
  const { projectId } = await params;
  const { epic: epicFilter } = await searchParams;
  const projects = await getProjects();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      epics: true,
      issues: {
        where: epicFilter ? { epicId: epicFilter } : undefined,
        include: {
          epic: true,
          subtasks: true,
        },
        orderBy: { order: "asc" },
      },
      _count: {
        select: { epics: true, issues: true },
      },
    },
  });

  if (!project) notFound();

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
      <Board
        key={JSON.stringify(project.issues.map((i) => i.id + i.status + i.order))}
        issues={project.issues}
        projectId={projectId}
        epics={project.epics}
      />
    </AppShell>
  );
}