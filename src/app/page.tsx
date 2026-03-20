import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function Home() {
  const project = await prisma.project.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (project) {
    redirect(`/projects/${project.id}/board`);
  }

  return (
    <main className="flex items-center justify-center h-screen">
      <p className="text-gray-500">No projects yet. Create one to get started.</p>
    </main>
  );
}