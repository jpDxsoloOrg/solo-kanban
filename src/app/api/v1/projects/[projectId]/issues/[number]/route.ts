import { prisma } from "@/lib/prisma";
import { updateIssue, type UpdateIssueInput } from "@/actions/update-issue";
import { moveIssueToSprint } from "@/actions/sprint-actions";
import {
  lockIssue, lockProjectOrdering, normalizeColumn, ORDER_TRANSACTION_OPTIONS,
} from "@/lib/issue-order";
import {
  allowOnly, apiRoute, badRequest, enumField, noContent, ok, parseIssueNumber, readBody,
  revalidateProject, stringField, unwrap,
} from "@/lib/api/http";
import {
  ISSUE_PRIORITIES, ISSUE_STATUSES, loadIssue, MAX_ISSUE_DESCRIPTION_LENGTH, MAX_ISSUE_TITLE_LENGTH,
  requireEpic, requireIssueId,
} from "@/lib/api/resources";

export const dynamic = "force-dynamic";

type Params = { projectId: string; number: string };

export const GET = apiRoute<Params>(async (_req, { projectId, number }) => {
  const issueId = await requireIssueId(projectId, parseIssueNumber(number));
  return ok(await loadIssue(issueId));
});

/**
 * Update an issue. Any of: title, description, status, priority, epicId
 * (null clears it), sprintId (a sprint id, "active", or null for the
 * backlog). A status change moves the issue to the end of its new column.
 */
export const PATCH = apiRoute<Params>(async (req, { projectId, number }) => {
  const issueId = await requireIssueId(projectId, parseIssueNumber(number));
  const body = await readBody(req);
  allowOnly(body, ["title", "description", "status", "priority", "epicId", "sprintId"]);

  const patch: UpdateIssueInput = {
    title: stringField(body, "title", { max: MAX_ISSUE_TITLE_LENGTH }),
    description: stringField(body, "description", { max: MAX_ISSUE_DESCRIPTION_LENGTH, nullable: true }),
    status: enumField(body, "status", ISSUE_STATUSES),
    priority: enumField(body, "priority", ISSUE_PRIORITIES),
    epicId: stringField(body, "epicId", { max: 100, nullable: true }),
  };
  if (patch.epicId) await requireEpic(projectId, patch.epicId);

  let sprintId = stringField(body, "sprintId", { max: 100, nullable: true });
  if (sprintId === "active") {
    const active = await prisma.sprint.findFirst({ where: { projectId, status: "ACTIVE" }, select: { id: true } });
    if (!active) throw badRequest("This project has no active sprint.");
    sprintId = active.id;
  }

  const fields = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as UpdateIssueInput;
  if (sprintId === undefined && Object.keys(fields).length === 0) throw badRequest("Nothing to update.");

  if (sprintId !== undefined) unwrap(await moveIssueToSprint(issueId, sprintId));
  if (Object.keys(fields).length > 0) await updateIssue(issueId, fields);

  revalidateProject(projectId);
  return ok(await loadIssue(issueId));
});

/** Delete an issue with its subtasks and comments. */
export const DELETE = apiRoute<Params>(async (_req, { projectId, number }) => {
  const issueId = await requireIssueId(projectId, parseIssueNumber(number));
  await prisma.$transaction(async (tx) => {
    await lockProjectOrdering(tx, projectId);
    const issue = await lockIssue(tx, issueId);
    if (!issue) return;
    await tx.issue.delete({ where: { id: issueId } });
    // Close the gap the issue left in its column.
    await normalizeColumn(tx, { projectId, sprintId: issue.sprintId, status: issue.status });
  }, ORDER_TRANSACTION_OPTIONS);
  revalidateProject(projectId);
  return noContent();
});
