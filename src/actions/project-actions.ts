"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function getProjects() {
  return prisma.project.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
    },
  });
}

export async function createProject(name: string, description?: string) {
  const project = await prisma.project.create({
    data: { name, description },
  });

  redirect(`/projects/${project.id}/board`);
}

export async function deleteProject(projectId: string) {
  await prisma.project.delete({
    where: { id: projectId },
  });

  // Redirect to first remaining project, or home
  const next = await prisma.project.findFirst({
    orderBy: { createdAt: "asc" },
  });

  redirect(next ? `/projects/${next.id}/board` : "/");
}