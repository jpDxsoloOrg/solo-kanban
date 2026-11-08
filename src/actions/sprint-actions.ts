"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { Sprint } from "@prisma/client";
import type { ActionResult, SprintWithCounts } from "@/types";
import { moveIssuesToSprint } from "@/lib/issue-order";
import {
  addDays,
  DEFAULT_SPRINT_LENGTH_DAYS,
  fromDateInputValue,
  utcToday,
} from "@/lib/sprint-dates";
import {
  MAX_SPRINT_GOAL_LENGTH as MAX_GOAL_LENGTH,
  MAX_SPRINT_NAME_LENGTH as MAX_NAME_LENGTH,
} from "@/lib/limits";

/** Dates cross the wire as `<input type="date">` strings ("YYYY-MM-DD"). */
export interface SprintInput {
  name?: string;
  goal?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * Where a sprint's unfinished issues go when it is completed:
 * - "new": a freshly created sprint (the usual roll-over)
 * - "backlog": back to the unplanned backlog
 * - any other string: the id of an existing PLANNED sprint
 */
export type IncompleteIssueTarget = "new" | "backlog" | (string & {});

export interface CompleteSprintOptions {
  moveIncompleteTo: IncompleteIssueTarget;
  /** Start the sprint the unfinished issues went to (ignored for "backlog"). */
  startNext?: boolean;
  /**
   * The user's calendar date ("YYYY-MM-DD", browser time zone). Used as the
   * start date when the next sprint is started without one planned, so it
   * isn't off by a day from the server's UTC date. Defaults to UTC today.
   */
  today?: string;
}

export interface CompleteSprintSummary {
  completedIssues: number;
  movedIssues: number;
  /** The sprint unfinished issues moved to (null when they went to the backlog). */
  nextSprintId: string | null;
  nextSprintStarted: boolean;
}

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** Validates name/goal/dates; returns a Prisma-ready patch or an error. */
function parseSprintInput(
  input: SprintInput,
): { ok: true; data: Partial<Pick<Sprint, "name" | "goal" | "startDate" | "endDate">> } | { ok: false; error: string } {
  const data: Partial<Pick<Sprint, "name" | "goal" | "startDate" | "endDate">> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Sprint name can't be empty." };
    if (name.length > MAX_NAME_LENGTH) {
      return { ok: false, error: `Sprint name must be ${MAX_NAME_LENGTH} characters or fewer.` };
    }
    data.name = name;
  }

  if (input.goal !== undefined) {
    const goal = input.goal?.trim() ?? "";
    if (goal.length > MAX_GOAL_LENGTH) {
      return { ok: false, error: `Sprint goal must be ${MAX_GOAL_LENGTH} characters or fewer.` };
    }
    data.goal = goal || null;
  }

  for (const key of ["startDate", "endDate"] as const) {
    const raw = input[key];
    if (raw === undefined) continue;
    if (raw === null || raw === "") {
      data[key] = null;
      continue;
    }
    const parsed = fromDateInputValue(raw);
    if (!parsed) return { ok: false, error: "Dates must be valid calendar dates." };
    data[key] = parsed;
  }

  return { ok: true, data };
}

function checkDateOrder(startDate: Date | null | undefined, endDate: Date | null | undefined) {
  if (startDate && endDate && endDate < startDate) {
    return "The end date can't be before the start date.";
  }
  return null;
}

async function nextSprintNumber(projectId: string, tx: Pick<typeof prisma, "sprint"> = prisma) {
  const agg = await tx.sprint.aggregate({ where: { projectId }, _max: { number: true } });
  return (agg._max.number ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** All sprints for a project: active first, then planned (oldest first), then completed (newest first). */
export async function getSprints(projectId: string): Promise<SprintWithCounts[]> {
  const sprints = await prisma.sprint.findMany({
    where: { projectId },
    include: { _count: { select: { issues: true } } },
    orderBy: { number: "asc" },
  });

  const rank = { ACTIVE: 0, PLANNED: 1, COMPLETED: 2 } as const;
  return sprints.sort((a, b) => {
    if (a.status !== b.status) return rank[a.status] - rank[b.status];
    return a.status === "COMPLETED" ? b.number - a.number : a.number - b.number;
  });
}

/**
 * The number the next sprint created in this project will get, so the UI can
 * label the roll-over choice "New sprint (Sprint N)".
 */
export async function getNextSprintNumber(projectId: string): Promise<number> {
  return nextSprintNumber(projectId);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Create a PLANNED sprint. Name defaults to "Sprint N". */
export async function createSprint(
  projectId: string,
  input: SprintInput = {},
): Promise<ActionResult<Sprint>> {
  const parsed = parseSprintInput(input);
  if (!parsed.ok) return parsed;
  const dateError = checkDateOrder(parsed.data.startDate, parsed.data.endDate);
  if (dateError) return { ok: false, error: dateError };

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return { ok: false, error: "Project not found." };

    const number = await nextSprintNumber(projectId);
    const sprint = await prisma.sprint.create({
      data: {
        projectId,
        number,
        name: parsed.data.name ?? `Sprint ${number}`,
        goal: parsed.data.goal ?? null,
        startDate: parsed.data.startDate ?? null,
        endDate: parsed.data.endDate ?? null,
        status: "PLANNED",
      },
    });

    revalidateProject(projectId);
    return { ok: true, data: sprint };
  } catch (error) {
    console.error("createSprint failed:", error);
    return { ok: false, error: errorMessage(error, "Failed to create sprint.") };
  }
}

/** Edit name, goal or dates. Completed sprints are read-only history. */
export async function updateSprint(
  sprintId: string,
  input: SprintInput,
): Promise<ActionResult<Sprint>> {
  const parsed = parseSprintInput(input);
  if (!parsed.ok) return parsed;

  try {
    const existing = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!existing) return { ok: false, error: "Sprint not found." };
    if (existing.status === "COMPLETED") {
      return { ok: false, error: "Completed sprints can't be edited." };
    }

    const startDate = "startDate" in parsed.data ? parsed.data.startDate : existing.startDate;
    const endDate = "endDate" in parsed.data ? parsed.data.endDate : existing.endDate;
    const dateError = checkDateOrder(startDate, endDate);
    if (dateError) return { ok: false, error: dateError };

    const sprint = await prisma.sprint.update({ where: { id: sprintId }, data: parsed.data });
    revalidateProject(sprint.projectId);
    return { ok: true, data: sprint };
  } catch (error) {
    console.error("updateSprint failed:", error);
    return { ok: false, error: errorMessage(error, "Failed to update sprint.") };
  }
}

/**
 * Start a PLANNED sprint. Fails if the project already has an active sprint.
 * Start date defaults to today; end date defaults to start + 14 days.
 */
export async function startSprint(
  sprintId: string,
  input: Pick<SprintInput, "startDate" | "endDate"> = {},
): Promise<ActionResult<Sprint>> {
  const parsed = parseSprintInput(input);
  if (!parsed.ok) return parsed;

  try {
    const sprint = await prisma.$transaction(async (tx) => {
      const existing = await tx.sprint.findUnique({ where: { id: sprintId } });
      if (!existing) throw new Error("Sprint not found.");
      if (existing.status !== "PLANNED") throw new Error("Only planned sprints can be started.");

      const active = await tx.sprint.findFirst({
        where: { projectId: existing.projectId, status: "ACTIVE" },
        select: { name: true },
      });
      if (active) {
        throw new Error(`"${active.name}" is still active. Complete it before starting another sprint.`);
      }

      const startDate =
        parsed.data.startDate ?? existing.startDate ?? utcToday();
      const endDate =
        parsed.data.endDate ?? existing.endDate ?? addDays(startDate, DEFAULT_SPRINT_LENGTH_DAYS);
      const dateError = checkDateOrder(startDate, endDate);
      if (dateError) throw new Error(dateError);

      return tx.sprint.update({
        where: { id: sprintId },
        data: { status: "ACTIVE", startDate, endDate },
      });
    });

    revalidateProject(sprint.projectId);
    return { ok: true, data: sprint };
  } catch (error) {
    console.error("startSprint failed:", error);
    return { ok: false, error: errorMessage(error, "Failed to start sprint.") };
  }
}

/**
 * Complete the ACTIVE sprint. DONE issues stay attached to it (that is the
 * sprint's history and what clears them off the board); every other issue is
 * moved to `moveIncompleteTo`, optionally starting that sprint right away.
 */
export async function completeSprint(
  sprintId: string,
  options: CompleteSprintOptions,
): Promise<ActionResult<CompleteSprintSummary>> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const sprint = await tx.sprint.findUnique({ where: { id: sprintId } });
      if (!sprint) throw new Error("Sprint not found.");
      if (sprint.status !== "ACTIVE") throw new Error("Only the active sprint can be completed.");

      const completedIssues = await tx.issue.count({ where: { sprintId, status: "DONE" } });
      const incomplete = await tx.issue.findMany({
        where: { sprintId, status: { not: "DONE" } },
        select: { id: true },
      });

      // Resolve where unfinished work goes.
      let nextSprint: Sprint | null = null;
      if (options.moveIncompleteTo === "new") {
        const number = await nextSprintNumber(sprint.projectId, tx);
        nextSprint = await tx.sprint.create({
          data: {
            projectId: sprint.projectId,
            number,
            name: `Sprint ${number}`,
            status: "PLANNED",
          },
        });
      } else if (options.moveIncompleteTo !== "backlog") {
        nextSprint = await tx.sprint.findUnique({ where: { id: options.moveIncompleteTo } });
        if (!nextSprint || nextSprint.projectId !== sprint.projectId) {
          throw new Error("The target sprint doesn't exist in this project.");
        }
        if (nextSprint.status !== "PLANNED") {
          throw new Error("Unfinished issues can only move to a planned sprint.");
        }
      }

      // Close the sprint first so the "one active sprint" rule holds when the
      // next one starts below.
      await tx.sprint.update({
        where: { id: sprintId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      const movedIssues = await moveIssuesToSprint(
        tx,
        sprint.projectId,
        incomplete.map((i) => i.id),
        nextSprint?.id ?? null,
      );

      let nextSprintStarted = false;
      if (nextSprint && options.startNext) {
        const startDate =
          nextSprint.startDate ?? fromDateInputValue(options.today) ?? utcToday();
        const endDate = nextSprint.endDate ?? addDays(startDate, DEFAULT_SPRINT_LENGTH_DAYS);
        await tx.sprint.update({
          where: { id: nextSprint.id },
          data: {
            status: "ACTIVE",
            startDate,
            endDate: endDate < startDate ? addDays(startDate, DEFAULT_SPRINT_LENGTH_DAYS) : endDate,
          },
        });
        nextSprintStarted = true;
      }

      return {
        projectId: sprint.projectId,
        summary: {
          completedIssues,
          movedIssues,
          nextSprintId: nextSprint?.id ?? null,
          nextSprintStarted,
        },
      };
    });

    revalidateProject(result.projectId);
    return { ok: true, data: result.summary };
  } catch (error) {
    console.error("completeSprint failed:", error);
    return { ok: false, error: errorMessage(error, "Failed to complete sprint.") };
  }
}

/** Delete a PLANNED sprint; its issues return to the backlog. */
export async function deleteSprint(sprintId: string): Promise<ActionResult<{ movedIssues: number }>> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const sprint = await tx.sprint.findUnique({
        where: { id: sprintId },
        include: { issues: { select: { id: true } } },
      });
      if (!sprint) throw new Error("Sprint not found.");
      if (sprint.status !== "PLANNED") {
        throw new Error("Only planned sprints can be deleted.");
      }

      const movedIssues = await moveIssuesToSprint(
        tx,
        sprint.projectId,
        sprint.issues.map((i) => i.id),
        null,
      );
      await tx.sprint.delete({ where: { id: sprintId } });
      return { projectId: sprint.projectId, movedIssues };
    });

    revalidateProject(result.projectId);
    return { ok: true, data: { movedIssues: result.movedIssues } };
  } catch (error) {
    console.error("deleteSprint failed:", error);
    return { ok: false, error: errorMessage(error, "Failed to delete sprint.") };
  }
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * Move an issue into a PLANNED/ACTIVE sprint, or to the backlog with
 * `sprintId: null`. The issue keeps its status and goes to the end of that
 * status column in the target.
 */
export async function moveIssueToSprint(
  issueId: string,
  sprintId: string | null,
): Promise<ActionResult<{ sprintId: string | null }>> {
  try {
    const projectId = await prisma.$transaction(async (tx) => {
      const issue = await tx.issue.findUnique({
        where: { id: issueId },
        select: { projectId: true },
      });
      if (!issue) throw new Error("Issue not found.");

      if (sprintId) {
        const sprint = await tx.sprint.findUnique({
          where: { id: sprintId },
          select: { projectId: true, status: true },
        });
        if (!sprint || sprint.projectId !== issue.projectId) {
          throw new Error("That sprint doesn't exist in this project.");
        }
        if (sprint.status === "COMPLETED") {
          throw new Error("Issues can't be added to a completed sprint.");
        }
      }

      await moveIssuesToSprint(tx, issue.projectId, [issueId], sprintId);
      return issue.projectId;
    });

    revalidateProject(projectId);
    return { ok: true, data: { sprintId } };
  } catch (error) {
    console.error("moveIssueToSprint failed:", error);
    return { ok: false, error: errorMessage(error, "Failed to move issue.") };
  }
}
