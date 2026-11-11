import { prisma } from "@/lib/prisma";
import { deleteSprint, updateSprint } from "@/actions/sprint-actions";
import {
  allowOnly, apiRoute, badRequest, notFound, ok, readBody, stringField, unwrap,
} from "@/lib/api/http";
import { requireSprint, sprintJson } from "@/lib/api/resources";
import { MAX_SPRINT_GOAL_LENGTH, MAX_SPRINT_NAME_LENGTH } from "@/lib/limits";

export const dynamic = "force-dynamic";

type Params = { projectId: string; sprintId: string };

export const GET = apiRoute<Params>(async (_req, { projectId, sprintId }) => {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: { _count: { select: { issues: true } } },
  });
  if (!sprint || sprint.projectId !== projectId) throw notFound("Sprint");
  return ok(sprintJson(sprint));
});

/** Edit name, goal or dates ("YYYY-MM-DD", null clears). Completed sprints are read-only. */
export const PATCH = apiRoute<Params>(async (req, { projectId, sprintId }) => {
  await requireSprint(projectId, sprintId);
  const body = await readBody(req);
  allowOnly(body, ["name", "goal", "startDate", "endDate"]);
  const input = {
    name: stringField(body, "name", { max: MAX_SPRINT_NAME_LENGTH }),
    goal: stringField(body, "goal", { max: MAX_SPRINT_GOAL_LENGTH, nullable: true }),
    startDate: stringField(body, "startDate", { max: 10, nullable: true }),
    endDate: stringField(body, "endDate", { max: 10, nullable: true }),
  };
  if (Object.values(input).every((value) => value === undefined)) throw badRequest("Nothing to update.");
  return ok(sprintJson(unwrap(await updateSprint(sprintId, input))));
});

/** Delete a PLANNED sprint; its issues go back to the backlog. */
export const DELETE = apiRoute<Params>(async (_req, { projectId, sprintId }) => {
  await requireSprint(projectId, sprintId);
  return ok(unwrap(await deleteSprint(sprintId)));
});
