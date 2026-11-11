import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createIssue } from "@/actions/create-issue";
import {
  allowOnly, apiRoute, badRequest, created, enumField, ok, pagination, parseEnum, readBody,
  requireString, revalidateProject, stringField,
} from "@/lib/api/http";
import {
  ISSUE_PRIORITIES, ISSUE_STATUSES, issueInclude, issueJson, loadIssue, MAX_ISSUE_DESCRIPTION_LENGTH,
  MAX_ISSUE_TITLE_LENGTH, requireEpic, requireProject,
} from "@/lib/api/resources";

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

  const [issues, total] = await Promise.all([
    prisma.issue.findMany({ where, include: issueInclude, orderBy: { number: "asc" }, take: limit, skip: offset }),
    prisma.issue.count({ where }),
  ]);
  return ok(issues.map(issueJson), { extra: { pagination: { total, limit, offset } } });
});

/**
 * Create an issue. `sprintId` is a sprint id, "active" for the active
 * sprint, or null/omitted for the backlog. It goes to the end of its column.
 */
export const POST = apiRoute<Params>(async (req, { projectId }) => {
  await requireProject(projectId);
  const body = await readBody(req);
  allowOnly(body, ["title", "description", "status", "priority", "epicId", "sprintId"]);

  const title = requireString(body, "title", { max: MAX_ISSUE_TITLE_LENGTH });
  const description = stringField(body, "description", { max: MAX_ISSUE_DESCRIPTION_LENGTH, nullable: true });
  const status = enumField(body, "status", ISSUE_STATUSES);
  const priority = enumField(body, "priority", ISSUE_PRIORITIES);
  const epicId = stringField(body, "epicId", { max: 100, nullable: true });
  if (epicId) await requireEpic(projectId, epicId);

  let sprintId = stringField(body, "sprintId", { max: 100, nullable: true }) ?? null;
  if (sprintId === "active") {
    const active = await prisma.sprint.findFirst({ where: { projectId, status: "ACTIVE" }, select: { id: true } });
    if (!active) throw badRequest("This project has no active sprint.");
    sprintId = active.id;
  }

  const issue = await createIssue({ projectId, title, description, status, priority, epicId, sprintId });
  revalidateProject(projectId);
  return created(await loadIssue(issue.id));
});
