import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { CreateFirstProject } from "@/components/layout/CreateFirstProject";

export const dynamic = "force-dynamic";

export default async function Home() {
  const project = await prisma.project.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (project) {
    redirect(`/projects/${project.id}/board`);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <CreateFirstProject />
    </main>
  );
}