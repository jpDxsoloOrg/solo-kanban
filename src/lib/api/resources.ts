import "server-only";
import type { Comment, Epic, Prisma, Project, Sprint, Subtask } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/sprint-dates";
import { badRequest, notFound } from "@/lib/api/http";

/**
 * Lookups and JSON shapes for the public API. Responses use stable, explicit
 * shapes rather than raw database rows, so internal columns can change
 * without breaking API clients.
 */

export const ISSUE_STATUSES = ["OPEN", "IN_PROGRESS", "REVIEW", "DONE"] as const;
export const ISSUE_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const SPRINT_STATUSES = ["PLANNED", "ACTIVE", "COMPLETED"] as const;

export const MAX_PROJECT_NAME_LENGTH = 200;
export const MAX_PROJECT_DESCRIPTION_LENGTH = 5000;
export const MAX_ISSUE_TITLE_LENGTH = 500;
export const MAX_ISSUE_DESCRIPTION_LENGTH = 100_000;
export const MAX_EPIC_NAME_LENGTH = 200;
export const MAX_SUBTASK_TITLE_LENGTH = 500;

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export function parseColor(value: string): string {
  if (!HEX_COLOR_RE.test(value)) throw badRequest('"color" must be a hex color like "#6366f1".');
  return value.toLowerCase();
}

// ---------------------------------------------------------------------------
// Lookups (404 when missing or in another project)
// ---------------------------------------------------------------------------

export async function requireProject(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound("Project");
  return project;
}

/** An issue's id, looked up by its per-project number. */
export async function requireIssueId(projectId: string, number: number): Promise<string> {
  const issue = await prisma.issue.findUnique({
    where: { projectId_number: { projectId, number } },
    select: { id: true },
  });
  if (!issue) throw notFound("Issue");
  return issue.id;
}

export async function requireEpic(projectId: string, epicId: string) {
  const epic = await prisma.epic.findUnique({ where: { id: epicId } });
  if (!epic || epic.projectId !== projectId) throw notFound("Epic");
  return epic;
}

export async function requireSprint(projectId: string, sprintId: string) {
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint || sprint.projectId !== projectId) throw notFound("Sprint");
  return sprint;
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

const date = (value: Date | null) => (value ? toDateInputValue(value) : null);

export function projectJson(project: Project) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export function epicJson(epic: Epic) {
  return {
    id: epic.id,
    projectId: epic.projectId,
    name: epic.name,
    description: epic.description,
    color: epic.color,
    createdAt: epic.createdAt,
    updatedAt: epic.updatedAt,
  };
}

export function sprintJson(sprint: Sprint & { _count?: { issues: number } }) {
  return {
    id: sprint.id,
    projectId: sprint.projectId,
    number: sprint.number,
    name: sprint.name,
    goal: sprint.goal,
    status: sprint.status,
    /** Calendar dates, "YYYY-MM-DD". */
    startDate: date(sprint.startDate),
    endDate: date(sprint.endDate),
    completedAt: sprint.completedAt,
    ...(sprint._count && { issueCount: sprint._count.issues }),
    createdAt: sprint.createdAt,
    updatedAt: sprint.updatedAt,
  };
}

export function subtaskJson(subtask: Subtask) {
  return {
    id: subtask.id,
    title: subtask.title,
    completed: subtask.completed,
    order: subtask.order,
    createdAt: subtask.createdAt,
    updatedAt: subtask.updatedAt,
  };
}

export interface CommentJson {
  id: string;
  parentId: string | null;
  body: string;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  replies?: CommentJson[];
}

export function commentJson(comment: Comment & { replies?: Comment[] }): CommentJson {
  return {
    id: comment.id,
    parentId: comment.parentId,
    body: comment.body,
    editedAt: comment.editedAt,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    ...(comment.replies && { replies: comment.replies.map((reply) => commentJson(reply)) }),
  };
}

export const issueInclude = {
  epic: { select: { id: true, name: true, color: true } },
  sprint: { select: { id: true, name: true, status: true } },
  subtasks: { orderBy: { order: "asc" } },
  _count: { select: { comments: true } },
} satisfies Prisma.IssueInclude;

export type IssueRecord = Prisma.IssueGetPayload<{ include: typeof issueInclude }>;

export function issueJson(issue: IssueRecord) {
  return {
    id: issue.id,
    projectId: issue.projectId,
    number: issue.number,
    title: issue.title,
    /** Markdown. */
    description: issue.description,
    status: issue.status,
    priority: issue.priority,
    /** Position within its board column (sprint + status), 0-based. */
    order: issue.order,
    epic: issue.epic,
    /** null = backlog. */
    sprint: issue.sprint,
    subtasks: issue.subtasks.map(subtaskJson),
    commentCount: issue._count.comments,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
}

/** Load an issue by id in the API's full shape. */
export async function loadIssue(issueId: string) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId }, include: issueInclude });
  if (!issue) throw notFound("Issue");
  return issueJson(issue);
}
