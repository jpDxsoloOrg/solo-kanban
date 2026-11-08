import "server-only";
import type { IssuePriority, IssueStatus, Prisma, SprintStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Data for the cross-project Overview page: every project with its active
 * sprint, a few counts, and its epics (plus a "No epic" bucket) with the
 * issues in them. Loaded with one query and shaped here, so the page and its
 * client components only render.
 */

export type StatusCounts = Record<IssueStatus, number>;

export interface OverviewIssue {
  id: string;
  number: number;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  /** The issue's own project, for its link. */
  projectId: string;
  /** null = backlog. */
  sprint: { name: string; status: SprintStatus } | null;
}

/** An epic, or a project's issues without an epic (`epicId` null). */
export interface OverviewEpic {
  /** Stable id for UI state: the epic id, or `none:<projectId>`. */
  key: string;
  epicId: string | null;
  name: string;
  /** Epic color; null for the "No epic" bucket. */
  color: string | null;
  projectId: string;
  projectName: string;
  /** Every issue, including DONE work archived in completed sprints. */
  total: number;
  done: number;
  counts: StatusCounts;
  /** Issues whose sprint is ACTIVE. */
  inCurrentSprint: number;
  /** 100% done with at least one issue. */
  finished: boolean;
  /**
   * In board order (Open → Done); within a status: active sprint, planned
   * sprints, backlog, then completed sprints (most recent first).
   */
  issues: OverviewIssue[];
}

export interface OverviewProject {
  id: string;
  name: string;
  activeSprint: {
    id: string;
    name: string;
    endDate: Date | null;
    total: number;
    done: number;
  } | null;
  /** Issues not DONE, wherever they are (sprints or backlog). */
  openIssues: number;
  /** Issues without a sprint. */
  backlogIssues: number;
  epicCount: number;
  /** Current-sprint work first, then unfinished, then finished; ties by name. */
  epics: OverviewEpic[];
  /** Issues without an epic; null when there are none. */
  noEpic: OverviewEpic | null;
}

const issueSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  priority: true,
  order: true,
  projectId: true,
  sprint: { select: { id: true, number: true, name: true, status: true } },
} satisfies Prisma.IssueSelect;

type LoadedIssue = Prisma.IssueGetPayload<{ select: typeof issueSelect }>;

const STATUS_RANK: Record<IssueStatus, number> = { OPEN: 0, IN_PROGRESS: 1, REVIEW: 2, DONE: 3 };

function sprintRank(sprint: LoadedIssue["sprint"]): number {
  if (!sprint) return 2; // backlog
  if (sprint.status === "ACTIVE") return 0;
  if (sprint.status === "PLANNED") return 1;
  return 3; // completed
}

function compareIssues(a: LoadedIssue, b: LoadedIssue): number {
  const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (byStatus) return byStatus;
  const bySprint = sprintRank(a.sprint) - sprintRank(b.sprint);
  if (bySprint) return bySprint;
  if (a.sprint && b.sprint && a.sprint.number !== b.sprint.number) {
    // Upcoming sprints soonest first; completed sprints most recent first.
    return a.sprint.status === "COMPLETED"
      ? b.sprint.number - a.sprint.number
      : a.sprint.number - b.sprint.number;
  }
  return a.order - b.order || a.number - b.number;
}

const nameCollator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function sortTier(epic: OverviewEpic): number {
  if (epic.inCurrentSprint > 0) return 0;
  return epic.finished ? 2 : 1;
}

function compareEpics(a: OverviewEpic, b: OverviewEpic): number {
  return (
    sortTier(a) - sortTier(b) ||
    nameCollator.compare(a.name, b.name) ||
    a.key.localeCompare(b.key)
  );
}

function emptyCounts(): StatusCounts {
  return { OPEN: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 };
}

function toOverviewIssue(issue: LoadedIssue): OverviewIssue {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    projectId: issue.projectId,
    sprint: issue.sprint && { name: issue.sprint.name, status: issue.sprint.status },
  };
}

function shapeEpic(
  base: Pick<OverviewEpic, "key" | "epicId" | "name" | "color" | "projectId" | "projectName">,
  issues: LoadedIssue[],
): OverviewEpic {
  const counts = emptyCounts();
  let inCurrentSprint = 0;
  for (const issue of issues) {
    counts[issue.status] += 1;
    if (issue.sprint?.status === "ACTIVE") inCurrentSprint += 1;
  }
  const total = issues.length;
  const done = counts.DONE;
  return {
    ...base,
    total,
    done,
    counts,
    inCurrentSprint,
    finished: total > 0 && done === total,
    issues: [...issues].sort(compareIssues).map(toOverviewIssue),
  };
}

/** Every project (oldest first) with its sprint summary, counts and epics. */
export async function getOverview(): Promise<OverviewProject[]> {
  const projects = await prisma.project.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      // At most one sprint is active per project.
      sprints: {
        where: { status: "ACTIVE" },
        select: { id: true, name: true, endDate: true },
        orderBy: { number: "desc" },
        take: 1,
      },
      epics: {
        select: { id: true, name: true, color: true, issues: { select: issueSelect } },
      },
      issues: { where: { epicId: null }, select: issueSelect },
    },
  });

  return projects.map((project) => {
    const base = { projectId: project.id, projectName: project.name };
    const epics = project.epics
      .map((epic) =>
        shapeEpic(
          { ...base, key: epic.id, epicId: epic.id, name: epic.name, color: epic.color },
          epic.issues,
        ),
      )
      .sort(compareEpics);
    const noEpic =
      project.issues.length > 0
        ? shapeEpic(
            { ...base, key: `none:${project.id}`, epicId: null, name: "No epic", color: null },
            project.issues,
          )
        : null;

    const allIssues = [...project.epics.flatMap((epic) => epic.issues), ...project.issues].filter(
      (issue) => issue.projectId === project.id,
    );
    const sprint = project.sprints[0] ?? null;
    const sprintIssues = sprint ? allIssues.filter((issue) => issue.sprint?.id === sprint.id) : [];

    return {
      id: project.id,
      name: project.name,
      activeSprint: sprint && {
        id: sprint.id,
        name: sprint.name,
        endDate: sprint.endDate,
        total: sprintIssues.length,
        done: sprintIssues.filter((issue) => issue.status === "DONE").length,
      },
      openIssues: allIssues.filter((issue) => issue.status !== "DONE").length,
      backlogIssues: allIssues.filter((issue) => issue.sprint === null).length,
      epicCount: project.epics.length,
      epics,
      noEpic,
    };
  });
}
