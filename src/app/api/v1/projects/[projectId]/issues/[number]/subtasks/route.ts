import { prisma } from "@/lib/prisma";
import {
  allowOnly, apiRoute, booleanField, created, ok, parseIssueNumber, readBody, requireString,
  revalidateProject,
} from "@/lib/api/http";
import { MAX_SUBTASK_TITLE_LENGTH, requireIssueId, subtaskJson } from "@/lib/api/resources";

export const dynamic = "force-dynamic";

type Params = { projectId: string; number: string };

export const GET = apiRoute<Params>(async (_req, { projectId, number }) => {
  const issueId = await requireIssueId(projectId, parseIssueNumber(number));
  const subtasks = await prisma.subtask.findMany({ where: { issueId }, orderBy: { order: "asc" } });
  return ok(subtasks.map(subtaskJson));
});

/** Add a subtask at the end of the issue's checklist. */
export const POST = apiRoute<Params>(async (req, { projectId, number }) => {
  const issueId = await requireIssueId(projectId, parseIssueNumber(number));
  const body = await readBody(req);
  allowOnly(body, ["title", "completed"]);
  const title = requireString(body, "title", { max: MAX_SUBTASK_TITLE_LENGTH });
  const completed = booleanField(body, "completed") ?? false;

  const last = await prisma.subtask.aggregate({ where: { issueId }, _max: { order: true } });
  const subtask = await prisma.subtask.create({
    data: { issueId, title, completed, order: (last._max.order ?? -1) + 1 },
  });
  revalidateProject(projectId);
  return created(subtaskJson(subtask));
});
