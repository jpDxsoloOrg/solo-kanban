import type { IssueStatus, Prisma, SprintStatus } from "@prisma/client";

/**
 * Board column ordering helpers.
 *
 * `Issue.order` is scoped to a *column*: the (projectId, sprintId, status)
 * triple. `sprintId: null` is the backlog. These helpers keep every column a
 * gap-free 0..n-1 sequence so that "drop at index N" on the client and
 * "order = N" on the server always agree.
 *
 * All helpers take a transaction client and are meant to run inside
 * `prisma.$transaction(async (tx) => ...)`. Column-wide writes are single
 * set-based statements, so their cost doesn't grow with the number of round
 * trips to the database (a migrated "Sprint 1" can hold hundreds of issues).
 */

type Tx = Prisma.TransactionClient;

export interface ColumnScope {
  projectId: string;
  sprintId: string | null;
  status: IssueStatus;
}

/**
 * Options for transactions that re-index columns. Prisma's 5 s default is
 * tight for a big column over a cross-region link, or while waiting for
 * `lockIssue`/`completeSprint` row locks.
 */
export const ORDER_TRANSACTION_OPTIONS = { timeout: 15_000 } as const;

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
  // Rows that change get a fresh updatedAt, as Prisma's update would give
  // them (the live-updates revision watches it).
  await tx.$executeRaw`
    UPDATE "Issue" i
    SET "order" = s.rn, "updatedAt" = ${new Date()}
    FROM (
      SELECT "id", (ROW_NUMBER() OVER (ORDER BY "order", "createdAt", "id") - 1)::int AS rn
      FROM "Issue"
      WHERE "projectId" = ${scope.projectId}
        AND "sprintId" IS NOT DISTINCT FROM ${scope.sprintId}::text
        AND "status" = ${scope.status}::"IssueStatus"
    ) s
    WHERE i."id" = s."id" AND i."order" <> s.rn`;
}

export interface LockedIssue {
  projectId: string;
  sprintId: string | null;
  status: IssueStatus;
  order: number;
  /** Status of the issue's sprint (null in the backlog). */
  sprintStatus: SprintStatus | null;
}

/**
 * Read an issue for a status/position change with its row locked
 * (FOR UPDATE), together with its sprint's status. The sprint row is locked
 * first (FOR KEY SHARE), so a change waits for a `completeSprint` that holds
 * the sprint (FOR UPDATE) and then sees the sprint's final state, and
 * `completeSprint` in turn waits for changes already holding it. KEY SHARE
 * doesn't block ordinary sprint edits or other issue moves.
 */
export async function lockIssue(tx: Tx, issueId: string): Promise<LockedIssue | null> {
  // The issue can move to another sprint while we wait for the sprint lock
  // (completeSprint rolls unfinished work over); then lock its new sprint.
  for (let attempt = 0; attempt < 3; attempt++) {
    const peek = await tx.issue.findUnique({ where: { id: issueId }, select: { sprintId: true } });
    if (!peek) return null;

    let sprintStatus: SprintStatus | null = null;
    if (peek.sprintId) {
      const [sprint] = await tx.$queryRaw<{ status: SprintStatus }[]>`
        SELECT "status" FROM "Sprint" WHERE "id" = ${peek.sprintId} FOR KEY SHARE`;
      sprintStatus = sprint?.status ?? null;
    }

    const [issue] = await tx.$queryRaw<Omit<LockedIssue, "sprintStatus">[]>`
      SELECT "projectId", "sprintId", "status", "order" FROM "Issue" WHERE "id" = ${issueId} FOR UPDATE`;
    if (!issue) return null;
    if (issue.sprintId === peek.sprintId) return { ...issue, sprintStatus };
  }
  throw new Error("The issue is being changed elsewhere. Please try again.");
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
    select: { id: true, status: true, sprintId: true },
  });

  const toMove = issues.filter((issue) => issue.sprintId !== targetSprintId);
  if (toMove.length === 0) return 0;

  // One statement for the whole move: per status, number the moved issues by
  // their current position (ties by createdAt, then id) and append them after
  // the target column's last issue.
  await tx.$executeRaw`
    UPDATE "Issue" i
    SET "sprintId" = ${targetSprintId}::text, "order" = m.base + m.rn, "updatedAt" = ${new Date()}
    FROM (
      SELECT x."id",
             (ROW_NUMBER() OVER (PARTITION BY x."status" ORDER BY x."order", x."createdAt", x."id") - 1)::int AS rn,
             COALESCE((
               SELECT MAX(t."order") + 1
               FROM "Issue" t
               WHERE t."projectId" = x."projectId"
                 AND t."sprintId" IS NOT DISTINCT FROM ${targetSprintId}::text
                 AND t."status" = x."status"
             ), 0) AS base
      FROM "Issue" x
      WHERE x."id" = ANY(${toMove.map((issue) => issue.id)}::text[])
    ) m
    WHERE i."id" = m."id"`;

  const vacated = new Map<string, ColumnScope>();
  for (const issue of toMove) {
    vacated.set(`${issue.sprintId ?? "backlog"}:${issue.status}`, {
      projectId,
      sprintId: issue.sprintId,
      status: issue.status,
    });
  }
  for (const scope of vacated.values()) {
    await normalizeColumn(tx, scope);
  }

  return toMove.length;
}
