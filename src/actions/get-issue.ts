"use server";

import { prisma } from "@/lib/prisma";
import { issueViewInclude } from "@/lib/issue-include";

export async function getIssue(issueId: string) {
  return prisma.issue.findUnique({
    where: { id: issueId },
    include: issueViewInclude,
  });
}
