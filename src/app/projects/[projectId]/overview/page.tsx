import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOverview } from "@/lib/overview";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { EpicsOverview } from "@/components/overview/EpicsOverview";
import { ProjectSummaryRow } from "@/components/overview/ProjectSummaryRow";

export const metadata: Metadata = {
  title: "Overview",
};

interface OverviewPageProps {
  params: Promise<{ projectId: string }>;
}

/**
 * Cross-project overview: every project's sprint at a glance and all epics
 * side by side. It lives under a project only so the sidebar keeps that
 * project's context.
 */
export default async function OverviewPage({ params }: OverviewPageProps) {
  const { projectId } = await params;

  const [project, overview] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      include: { epics: true },
    }),
    getOverview(),
  ]);

  if (!project) notFound();

  return (
    <AppShell
      title="Overview"
      sidebar={
        <Sidebar
          projectId={projectId}
          projects={overview.map(({ id, name }) => ({ id, name }))}
          epics={project.epics}
          epicFilter={null}
        />
      }
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pb-16 pt-2 sm:px-6">
        <header>
          <h1 className="text-xl font-semibold text-foreground">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sprints and epics across all your projects.
          </p>
        </header>

        <ProjectSummaryRow projects={overview} />
        <EpicsOverview projects={overview} />
      </div>
    </AppShell>
  );
}
