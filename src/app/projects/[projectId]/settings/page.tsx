import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { ProjectSettings } from "@/components/settings/ProjectSettings";
import { getProjects } from "@/actions/project-actions";

interface SettingsPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { projectId } = await params;
  const projects = await getProjects();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      epics: true,
      _count: {
        select: { issues: true, epics: true },
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
          epicFilter={null}
        />
      }
    >
      <ProjectSettings project={project} issueCount={project._count.issues} />
    </AppShell>
  );
}