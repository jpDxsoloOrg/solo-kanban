import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui";

export default async function Home() {
  const projects = await prisma.project.findMany({
    include: {
      _count: {
        select: { issues: true, epics: true },
      },
    },
  });

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-6">Solo Kanban</h1>
      <div className="grid gap-4 max-w-sm">
        {projects.map((project: (typeof projects)[number]) => (
          <Card key={project.id}>
            <CardContent>
              <h2 className="text-lg font-semibold">{project.name}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {project.description}
              </p>
              <p className="text-sm mt-2">
                {project._count.epics} epics, {project._count.issues} issues
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}