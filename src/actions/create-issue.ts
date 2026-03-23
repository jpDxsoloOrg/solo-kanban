"use server";

import { prisma } from "@/lib/prisma";
import type { IssueStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function createIssue(
  projectId: string,
  title: string,
  status: IssueStatus,
  epicId?: string
) {
  // Place the new issue at the end of the target column
  const [maxOrder, maxNumber] = await Promise.all([
    prisma.issue.aggregate({
      where: { projectId, status },
      _max: { order: true },
    }),
    prisma.issue.aggregate({
      where: { projectId },
      _max: { number: true },
    }),
  ]);

  const order = (maxOrder._max.order ?? -1) + 1;
  const number = (maxNumber._max.number ?? 0) + 1;

  const issue = await prisma.issue.create({
    data: {
      title,
      status,
      order,
      number,
      projectId,
      ...(epicId && { epicId }),
    },
    include: {
      epic: true,
      subtasks: true,
    },
  });

  revalidatePath(`/projects/${projectId}/board`);
  return issue;
}