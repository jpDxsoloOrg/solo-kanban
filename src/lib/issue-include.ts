import type { Prisma } from "@prisma/client";

/** What the UI shows of a child issue in its parent's Subtasks list and card. */
export const childSummarySelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  priority: true,
  childOrder: true,
} satisfies Prisma.IssueSelect;

/** A child issue's parent, as shown in breadcrumbs and card markers. */
export const parentSummarySelect = {
  id: true,
  number: true,
  title: true,
} satisfies Prisma.IssueSelect;

export const childrenInclude = {
  select: childSummarySelect,
  orderBy: [{ childOrder: "asc" }, { number: "asc" }],
} satisfies Prisma.Issue$childrenArgs;

/** Everything the board, issue page and edit dialog need for one issue. */
export const issueViewInclude = {
  epic: true,
  sprint: true,
  subtasks: { orderBy: { order: "asc" } },
  parent: { select: parentSummarySelect },
  children: childrenInclude,
  _count: { select: { comments: true } },
} satisfies Prisma.IssueInclude;

/** Fields an issue row (backlog, sprint report) shows: see IssueRowIssue. */
export const issueRowSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  priority: true,
  sprintId: true,
  parentId: true,
  epic: { select: { name: true, color: true } },
  parent: { select: { number: true, title: true } },
  children: { select: { status: true } },
} satisfies Prisma.IssueSelect;
