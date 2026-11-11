import { prisma } from "@/lib/prisma";
import {
  allowOnly, apiRoute, badRequest, booleanField, noContent, notFound, ok, parseIssueNumber, readBody,
  revalidateProject, stringField,
} from "@/lib/api/http";
import { MAX_SUBTASK_TITLE_LENGTH, requireIssueId, subtaskJson } from "@/lib/api/resources";

export const dynamic = "force-dynamic";

type Params = { projectId: string; number: string; subtaskId: string };

async function requireSubtask({ projectId, number, subtaskId }: Params) {
  const issueId = await requireIssueId(projectId, parseIssueNumber(number));
  const subtask = await prisma.subtask.findUnique({ where: { id: subtaskId }, select: { issueId: true } });
  if (!subtask || subtask.issueId !== issueId) throw notFound("Subtask");
}

/** Rename a subtask or check/uncheck it. */
export const PATCH = apiRoute<Params>(async (req, params) => {
  await requireSubtask(params);
  const body = await readBody(req);
  allowOnly(body, ["title", "completed"]);
  const title = stringField(body, "title", { max: MAX_SUBTASK_TITLE_LENGTH });
  const completed = booleanField(body, "completed");
  if (title === undefined && completed === undefined) throw badRequest("Nothing to update.");

  const subtask = await prisma.subtask.update({ where: { id: params.subtaskId }, data: { title, completed } });
  revalidateProject(params.projectId);
  return ok(subtaskJson(subtask));
});

export const DELETE = apiRoute<Params>(async (_req, params) => {
  await requireSubtask(params);
  await prisma.subtask.delete({ where: { id: params.subtaskId } });
  revalidateProject(params.projectId);
  return noContent();
});
