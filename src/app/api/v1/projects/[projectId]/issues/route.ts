import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createIssue } from "@/actions/create-issue";
import {
  allowOnly, apiRoute, badRequest, booleanParam, created, enumField, intField, ok, pagination, parseEnum,
  parseIssueNumber, readBody, requireString, revalidateProject, stringField,
} from "@/lib/api/http";
import {
  ISSUE_PRIORITIES, ISSUE_STATUSES, issueIdForField, issueInclude, issueJson, loadIssue,
  MAX_ISSUE_DESCRIPTION_LENGTH, MAX_ISSUE_TITLE_LENGTH, requireEpic, requireIssueId, requireProject,
} from "@/lib/api/resources";
import { skipsParentSync } from "@/lib/issue-hierarchy";

export const dynamic = "force-dynamic";

type Params = { projectId: string };

function listParam<T extends string>(raw: string | null, key: string, values: readonly T[]): T[] | undefined {
  if (!raw) return undefined;
  return raw.split(",").filter(Boolean).map((value) => parseEnum(value, key, values));
}

/**
 * List a project's issues, by number. Filters (all optional):
 * - status / priority: comma-separated values
 * - sprint: "active", "backlog" or a sprint id
 * - epicId: an epic id, or "none" for issues without an epic
 * - q: case-insensitive text in the title
 * - parent: an issue number; only that issue's children, in child order
 * - topLevel=true: only issues that aren't children (subtasks)
 * - includeChildren=true (with topLevel=true): each matching issue is
 *   followed by all of its children, in child order, whatever the other
 *   filters say. Pagination counts the top-level issues.
 */
export const GET = apiRoute<Params>(async (req, { projectId }) => {
  await requireProject(projectId);
  const params = req.nextUrl.searchParams;
  const { limit, offset } = pagination(req);

  const where: Prisma.IssueWhereInput = { projectId };
  const statuses = listParam(params.get("status"), "status", ISSUE_STATUSES);
  if (statuses) where.status = { in: statuses };
  const priorities = listParam(params.get("priority"), "priority", ISSUE_PRIORITIES);
  if (priorities) where.priority = { in: priorities };

  const sprint = params.get("sprint");
  if (sprint === "backlog") where.sprintId = null;
  else if (sprint === "active") where.sprint = { status: "ACTIVE" };
  else if (sprint) where.sprintId = sprint;

  const epicId = params.get("epicId");
  if (epicId) where.epicId = epicId === "none" ? null : epicId;

  const q = params.get("q")?.trim();
  if (q) where.title = { contains: q, mode: "insensitive" };

  const parent = params.get("parent");
  const topLevel = booleanParam(req, "topLevel");
  const includeChildren = booleanParam(req, "includeChildren");
  if (parent && topLevel) throw badRequest('"parent" and "topLevel" can\'t be combined.');
  if (includeChildren && !topLevel) throw badRequest('"includeChildren" needs "topLevel=true".');
  if (parent) where.parentId = await requireIssueId(projectId, parseIssueNumber(parent));
  if (topLevel) where.parentId = null;

  const orderBy: Prisma.IssueOrderByWithRelationInput[] = parent
    ? [{ childOrder: "asc" }, { number: "asc" }]
    : [{ number: "asc" }];
  const [issues, total] = await Promise.all([
    prisma.issue.findMany({ where, include: issueInclude, orderBy, take: limit, skip: offset }),
    prisma.issue.count({ where }),
  ]);

  let rows = issues;
  if (includeChildren && issues.length > 0) {
    const children = await prisma.issue.findMany({
      where: { parentId: { in: issues.map((issue) => issue.id) } },
      include: issueInclude,
      orderBy: [{ childOrder: "asc" }, { number: "asc" }],
    });
    rows = issues.flatMap((issue) => [issue, ...children.filter((child) => child.parentId === issue.id)]);
  }
  return ok(rows.map(issueJson), { extra: { pagination: { total, limit, offset } } });
});

/**
 * Create an issue. `sprintId` is a sprint id, "active" for the active
 * sprint, or null/omitted for the backlog. It goes to the end of its column.
 *
 * `parentNumber` makes it a child issue (subtask) of that issue: it then
 * inherits the parent's sprint and epic unless `sprintId`/`epicId` are sent,
 * and goes to the end of the parent's children (or to `childOrder`). The
 * parent moves forward to match (see lib/issue-hierarchy) unless the request
 * has the `X-Skip-Parent-Auto-Move: true` header.
 */
export const POST = apiRoute<Params>(async (req, { projectId }) => {
  await requireProject(projectId);
  const body = await readBody(req);
  allowOnly(body, [
    "title", "description", "status", "priority", "epicId", "sprintId", "parentNumber", "childOrder",
  ]);

  const title = requireString(body, "title", { max: MAX_ISSUE_TITLE_LENGTH });
  const description = stringField(body, "description", { max: MAX_ISSUE_DESCRIPTION_LENGTH, nullable: true });
  const status = enumField(body, "status", ISSUE_STATUSES);
  const priority = enumField(body, "priority", ISSUE_PRIORITIES);
  const epicId = stringField(body, "epicId", { max: 100, nullable: true });
  if (epicId) await requireEpic(projectId, epicId);

  const parentId =
    body.parentNumber === undefined || body.parentNumber === null
      ? null
      : await issueIdForField(projectId, body.parentNumber, "parentNumber");
  const childOrder = intField(body, "childOrder");
  if (childOrder !== undefined && !parentId) throw badRequest('"childOrder" needs "parentNumber".');

  // Omitted means the backlog, or the parent's sprint for a child issue.
  let sprintId = stringField(body, "sprintId", { max: 100, nullable: true });
  if (sprintId === undefined && !parentId) sprintId = null;
  if (sprintId === "active") {
    const active = await prisma.sprint.findFirst({ where: { projectId, status: "ACTIVE" }, select: { id: true } });
    if (!active) throw badRequest("This project has no active sprint.");
    sprintId = active.id;
  }

  const issue = await createIssue({
    projectId,
    title,
    description,
    status,
    priority,
    epicId,
    sprintId,
    parentId,
    childOrder,
    skipParentSync: skipsParentSync(req.headers),
  });
  revalidateProject(projectId);
  return created(await loadIssue(issue.id));
});
