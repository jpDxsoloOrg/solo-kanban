import { prisma } from "@/lib/prisma";
import { updateIssue, type UpdateIssueInput } from "@/actions/update-issue";
import { normalizeChildren, skipsParentSync, syncParentStatus } from "@/lib/issue-hierarchy";
import { moveIssueToSprint } from "@/actions/sprint-actions";
import {
  lockIssue, lockProjectOrdering, normalizeColumn, ORDER_TRANSACTION_OPTIONS,
} from "@/lib/issue-order";
import {
  allowOnly, apiRoute, ApiError, badRequest, enumField, intField, noContent, ok, parseIssueNumber, readBody,
  revalidateProject, stringField, unwrap,
} from "@/lib/api/http";
import {
  ISSUE_PRIORITIES, ISSUE_STATUSES, issueIdForField, loadIssue, MAX_ISSUE_DESCRIPTION_LENGTH,
  MAX_ISSUE_TITLE_LENGTH, requireEpic, requireIssueId,
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
 * backlog), parentNumber (an issue number to make this a child issue of, or
 * null to make it top-level), childOrder (its position among its parent's
 * children). A status change moves the issue to the end of its new column.
 *
 * Moving a parent to another sprint takes its unfinished children with it.
 * A child's status change moves its parent forward (see
 * lib/issue-hierarchy) unless the request has `X-Skip-Parent-Auto-Move: true`.
 */
export const PATCH = apiRoute<Params>(async (req, { projectId, number }) => {
  const issueId = await requireIssueId(projectId, parseIssueNumber(number));
  const body = await readBody(req);
  allowOnly(body, [
    "title", "description", "status", "priority", "epicId", "sprintId", "parentNumber", "childOrder",
  ]);

  const patch: UpdateIssueInput = {
    title: stringField(body, "title", { max: MAX_ISSUE_TITLE_LENGTH }),
    description: stringField(body, "description", { max: MAX_ISSUE_DESCRIPTION_LENGTH, nullable: true }),
    status: enumField(body, "status", ISSUE_STATUSES),
    priority: enumField(body, "priority", ISSUE_PRIORITIES),
    epicId: stringField(body, "epicId", { max: 100, nullable: true }),
    parentId:
      body.parentNumber === undefined
        ? undefined
        : body.parentNumber === null
          ? null
          : await issueIdForField(projectId, body.parentNumber, "parentNumber"),
    childOrder: intField(body, "childOrder"),
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
  if (Object.keys(fields).length > 0) {
    await updateIssue(issueId, fields, { skipParentSync: skipsParentSync(req.headers) });
  }

  revalidateProject(projectId);
  return ok(await loadIssue(issueId));
});

const CHILD_MODES = ["detach", "delete"] as const;

/**
 * Delete an issue with its (legacy) subtasks and comments.
 *
 * An issue with child issues is only deleted when `?children=` says what
 * happens to them: `detach` keeps them as top-level issues, `delete`
 * deletes them too. Without it the request fails with 409, so children are
 * never removed by accident.
 */
export const DELETE = apiRoute<Params>(async (req, { projectId, number }) => {
  const issueId = await requireIssueId(projectId, parseIssueNumber(number));
  const rawMode = req.nextUrl.searchParams.get("children");
  const mode = rawMode ? CHILD_MODES.find((value) => value === rawMode.trim().toLowerCase()) : undefined;
  if (rawMode && !mode) throw badRequest('"children" must be "detach" or "delete".');
  const skipSync = skipsParentSync(req.headers);

  await prisma.$transaction(async (tx) => {
    await lockProjectOrdering(tx, projectId);
    const issue = await lockIssue(tx, issueId);
    if (!issue) return;
    const { parentId } = await tx.issue.findUniqueOrThrow({ where: { id: issueId }, select: { parentId: true } });
    const children = await tx.issue.findMany({
      where: { parentId: issueId },
      select: { id: true, sprintId: true, status: true },
    });

    if (children.length > 0 && !mode) {
      throw new ApiError(
        409,
        "has_children",
        `Issue #${number} has ${children.length} subtask${children.length === 1 ? "" : "s"}. ` +
          'Add ?children=detach to keep them as top-level issues, or ?children=delete to delete them too.',
      );
    }
    if (mode === "delete" && children.length > 0) {
      await tx.issue.deleteMany({ where: { parentId: issueId } });
    }
    // With "detach" the FK's ON DELETE SET NULL makes the children top-level.
    await tx.issue.delete({ where: { id: issueId } });

    // Close the gaps left in the columns.
    const columns = new Map<string, { sprintId: string | null; status: typeof issue.status }>();
    columns.set(`${issue.sprintId}:${issue.status}`, { sprintId: issue.sprintId, status: issue.status });
    if (mode === "delete") {
      for (const child of children) {
        columns.set(`${child.sprintId}:${child.status}`, { sprintId: child.sprintId, status: child.status });
      }
    }
    for (const column of columns.values()) {
      await normalizeColumn(tx, { projectId, ...column });
    }

    // A deleted child: close the gap among its siblings, and the ones left
    // may now all be done.
    if (parentId) {
      await normalizeChildren(tx, parentId);
      if (!skipSync) await syncParentStatus(tx, parentId);
    }
  }, ORDER_TRANSACTION_OPTIONS);
  revalidateProject(projectId);
  return noContent();
});
