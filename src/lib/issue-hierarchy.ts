import type { IssueStatus, Prisma } from "@prisma/client";
import { lockIssue, nextOrderInColumn, normalizeColumn } from "@/lib/issue-order";

/**
 * Child issues ("subtasks", Jira style).
 *
 * A child is a full issue whose `parentId` points at its parent. There is one
 * level only: a parent can't itself be a child, and a child can't have
 * children. `childOrder` is the child's position among its siblings.
 *
 * This module is the one place that knows the rules: who may be a parent,
 * how children are ordered, which unfinished children follow a parent into
 * another sprint, and how a parent's status follows its children. Server
 * actions, the public API and the UI (through the actions) all go through it.
 *
 * Helpers take a transaction client. Anything that changes a status
 * (`syncParentStatus`) must run after the transaction took
 * `lockProjectOrdering`, like every other path that re-orders columns.
 */

type Tx = Prisma.TransactionClient;

/** How far along a status is. Auto-moves only ever go forward. */
export const STATUS_RANK: Record<IssueStatus, number> = {
  OPEN: 0,
  IN_PROGRESS: 1,
  REVIEW: 2,
  DONE: 3,
};

export interface ParentCandidate {
  id: string;
  number: number;
  sprintId: string | null;
  epicId: string | null;
  sprintStatus: "PLANNED" | "ACTIVE" | "COMPLETED" | null;
}

/**
 * Check that `parentId` can be the parent of `childId` (null for an issue
 * that is being created) and return what children inherit from it.
 */
export async function requireParentFor(
  tx: Tx,
  projectId: string,
  parentId: string,
  childId: string | null,
): Promise<ParentCandidate> {
  const parent = await tx.issue.findUnique({
    where: { id: parentId },
    select: {
      id: true,
      number: true,
      projectId: true,
      parentId: true,
      sprintId: true,
      epicId: true,
      sprint: { select: { status: true } },
    },
  });
  if (!parent || parent.projectId !== projectId) throw new Error("Parent issue not found.");
  if (childId && childId === parent.id) throw new Error("An issue can't be its own parent.");
  if (parent.parentId) {
    throw new Error(`#${parent.number} is a subtask itself, and subtasks can't have subtasks.`);
  }
  if (childId) {
    const ownChildren = await tx.issue.count({ where: { parentId: childId } });
    if (ownChildren > 0) {
      throw new Error("This issue has subtasks of its own, so it can't become a subtask.");
    }
  }
  return {
    id: parent.id,
    number: parent.number,
    sprintId: parent.sprintId,
    epicId: parent.epicId,
    sprintStatus: parent.sprint?.status ?? null,
  };
}

/** The `childOrder` that appends a child after its parent's other children. */
export async function nextChildOrder(tx: Tx, parentId: string): Promise<number> {
  const agg = await tx.issue.aggregate({ where: { parentId }, _max: { childOrder: true } });
  return (agg._max.childOrder ?? -1) + 1;
}

/** Re-index a parent's children to 0..n-1, keeping their relative order. */
export async function normalizeChildren(tx: Tx, parentId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Issue" i
    SET "childOrder" = s.rn, "updatedAt" = ${new Date()}
    FROM (
      SELECT "id", (ROW_NUMBER() OVER (ORDER BY "childOrder", "number", "id") - 1)::int AS rn
      FROM "Issue"
      WHERE "parentId" = ${parentId}
    ) s
    WHERE i."id" = s."id" AND i."childOrder" <> s.rn`;
}

/** Move a child to position `index` (0-based, clamped) among its siblings. */
export async function moveChild(tx: Tx, parentId: string, childId: string, index: number): Promise<void> {
  const siblings = await tx.issue.findMany({
    where: { parentId },
    select: { id: true, childOrder: true },
    orderBy: [{ childOrder: "asc" }, { number: "asc" }],
  });
  const from = siblings.findIndex((sibling) => sibling.id === childId);
  if (from === -1) throw new Error("That issue isn't a subtask of this parent.");
  const [moved] = siblings.splice(from, 1);
  const to = Math.max(0, Math.min(Math.trunc(index) || 0, siblings.length));
  siblings.splice(to, 0, moved);
  for (const [position, sibling] of siblings.entries()) {
    if (sibling.childOrder !== position) {
      await tx.issue.update({ where: { id: sibling.id }, data: { childOrder: position } });
    }
  }
}

/**
 * The unfinished children of these parents that should follow them into
 * another sprint (or the backlog). DONE children stay where they were
 * finished, and so does anything archived with a completed sprint.
 */
export async function unfinishedChildIds(tx: Tx, parentIds: string[]): Promise<string[]> {
  if (parentIds.length === 0) return [];
  const children = await tx.issue.findMany({
    where: {
      parentId: { in: parentIds },
      status: { not: "DONE" },
      OR: [{ sprintId: null }, { sprint: { status: { not: "COMPLETED" } } }],
    },
    select: { id: true },
  });
  return children.map((child) => child.id);
}

export interface ParentAutoMove {
  parentId: string;
  number: number;
  from: IssueStatus;
  to: IssueStatus;
}

/**
 * The status a parent should be moved to, given its children's statuses, or
 * null to leave it alone:
 * - every child DONE → REVIEW (the owner marks Done after reviewing);
 * - any child started (In progress, Review or Done) → IN_PROGRESS.
 * Never backwards: a target at or behind the parent's status is ignored.
 */
export function parentTargetStatus(
  parentStatus: IssueStatus,
  childStatuses: IssueStatus[],
): IssueStatus | null {
  if (childStatuses.length === 0) return null;
  let target: IssueStatus | null = null;
  if (childStatuses.every((status) => status === "DONE")) target = "REVIEW";
  else if (childStatuses.some((status) => status !== "OPEN")) target = "IN_PROGRESS";
  if (!target || STATUS_RANK[target] <= STATUS_RANK[parentStatus]) return null;
  return target;
}

/**
 * Move a parent forward to match its children (see `parentTargetStatus`).
 * Call it after a child's status (or set of children) changed, inside the
 * same transaction, after `lockProjectOrdering`. The parent goes to the end
 * of its new column, like any status change. Returns what moved, if anything.
 */
export async function syncParentStatus(tx: Tx, parentId: string): Promise<ParentAutoMove | null> {
  const parent = await lockIssue(tx, parentId);
  if (!parent) return null;
  // Archived history isn't touched.
  if (parent.sprintStatus === "COMPLETED") return null;

  const children = await tx.issue.findMany({ where: { parentId }, select: { status: true } });
  const target = parentTargetStatus(
    parent.status,
    children.map((child) => child.status),
  );
  if (!target) return null;

  const order = await nextOrderInColumn(tx, {
    projectId: parent.projectId,
    sprintId: parent.sprintId,
    status: target,
  });
  const updated = await tx.issue.update({
    where: { id: parentId },
    data: { status: target, order },
    select: { number: true },
  });
  await normalizeColumn(tx, { projectId: parent.projectId, sprintId: parent.sprintId, status: parent.status });
  return { parentId, number: updated.number, from: parent.status, to: target };
}

/**
 * Request header that turns off parent auto-moves for one API call. The
 * subtask conversion script sends it, so converting checklists leaves every
 * parent's status as it was.
 */
export const SKIP_PARENT_SYNC_HEADER = "x-skip-parent-auto-move";

export function skipsParentSync(headers: Headers): boolean {
  const value = headers.get(SKIP_PARENT_SYNC_HEADER)?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
