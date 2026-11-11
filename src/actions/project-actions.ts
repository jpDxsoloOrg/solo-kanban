"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { insertProject } from "@/lib/projects";

export async function getProjects() {
  return prisma.project.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
    },
  });
}

/**
 * `today` is the user's calendar date ("YYYY-MM-DD", browser time zone), so
 * Sprint 1 starts on their day rather than the server's UTC day.
 */
export async function createProject(name: string, description?: string, today?: string) {
  const project = await insertProject(name, description, today);
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

 export async function updateProject(
     projectId: string,
     data: { name?: string; description?: string | null }) {
      const project = await prisma.project.update({
        where: { id: projectId },
        data,
      });
    
      return project;
   }