import type { IssueStatus, Prisma } from "@prisma/client";

/**
 * Board column ordering helpers.
 *
 * `Issue.order` is scoped to a *column*: the (projectId, sprintId, status)
 * triple. `sprintId: null` is the backlog. These helpers keep every column a
 * gap-free 0..n-1 sequence so that "drop at index N" on the client and
 * "order = N" on the server always agree.
 *
 * All helpers take a transaction client and are meant to run inside
 * `prisma.$transaction(async (tx) => ...)`.
 */

type Tx = Prisma.TransactionClient;

export interface ColumnScope {
  projectId: string;
  sprintId: string | null;
  status: IssueStatus;
}

/** The order value that appends an issue at the end of a column. */
export async function nextOrderInColumn(tx: Tx, scope: ColumnScope): Promise<number> {
  const agg = await tx.issue.aggregate({
    where: { projectId: scope.projectId, sprintId: scope.sprintId, status: scope.status },
    _max: { order: true },
  });
  return (agg._max.order ?? -1) + 1;
}

/** Re-index a column to 0..n-1, preserving its current relative order. */
export async function normalizeColumn(tx: Tx, scope: ColumnScope): Promise<void> {
  const issues = await tx.issue.findMany({
    where: { projectId: scope.projectId, sprintId: scope.sprintId, status: scope.status },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, order: true },
  });

  for (const [index, issue] of issues.entries()) {
    if (issue.order !== index) {
      await tx.issue.update({ where: { id: issue.id }, data: { order: index } });
    }
  }
}

/**
 * Move issues into another sprint (or the backlog when `targetSprintId` is
 * null), keeping each issue's status. Moved issues are appended to the end of
 * their status column in the target, preserving their relative order, and
 * the columns they left are re-indexed.
 */
export async function moveIssuesToSprint(
  tx: Tx,
  projectId: string,
  issueIds: string[],
  targetSprintId: string | null,
): Promise<number> {
  if (issueIds.length === 0) return 0;

  const issues = await tx.issue.findMany({
    where: { id: { in: issueIds }, projectId },
    orderBy: [{ status: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    select: { id: true, status: true, sprintId: true },
  });

  const toMove = issues.filter((issue) => issue.sprintId !== targetSprintId);
  if (toMove.length === 0) return 0;

  const nextByStatus = new Map<IssueStatus, number>();
  const vacated = new Map<string, ColumnScope>();

  for (const issue of toMove) {
    let order = nextByStatus.get(issue.status);
    if (order === undefined) {
      order = await nextOrderInColumn(tx, {
        projectId,
        sprintId: targetSprintId,
        status: issue.status,
      });
    }
    nextByStatus.set(issue.status, order + 1);

    vacated.set(`${issue.sprintId ?? "backlog"}:${issue.status}`, {
      projectId,
      sprintId: issue.sprintId,
      status: issue.status,
    });

    await tx.issue.update({
      where: { id: issue.id },
      data: { sprintId: targetSprintId, order },
    });
  }

  for (const scope of vacated.values()) {
    await normalizeColumn(tx, scope);
  }

  return toMove.length;
}
