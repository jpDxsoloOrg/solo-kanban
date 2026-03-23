import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { CreateFirstProject } from "@/components/layout/CreateFirstProject";

export default async function Home() {
  const project = await prisma.project.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (project) {
    redirect(`/projects/${project.id}/board`);
  }

  return (
    <main className="flex items-center justify-center h-screen">
      <CreateFirstProject />
    </main>
  );
}