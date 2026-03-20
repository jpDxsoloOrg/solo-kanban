import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";

interface BoardPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function BoardPage({ params }: BoardPageProps) {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      epics: true,
      issues: {
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
          projectName={project.name}
          epicCount={project._count.epics}
          issueCount={project._count.issues}
        />
      }
    >
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Board coming soon.</p>
      </div>
    </AppShell>
  );
}