"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { addDays, DEFAULT_SPRINT_LENGTH_DAYS, utcToday } from "@/lib/sprint-dates";

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
  // Every project starts with an active sprint so the board works right away.
  const startDate = utcToday();
  const project = await prisma.project.create({
    data: {
      name,
      description,
      sprints: {
        create: {
          number: 1,
          name: "Sprint 1",
          status: "ACTIVE",
          startDate,
          endDate: addDays(startDate, DEFAULT_SPRINT_LENGTH_DAYS),
        },
      },
    },
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

 export async function updateProject(
     projectId: string,
     data: { name?: string; description?: string | null }) {
      const project = await prisma.project.update({
        where: { id: projectId },
        data,
      });
    
      return project;
   }