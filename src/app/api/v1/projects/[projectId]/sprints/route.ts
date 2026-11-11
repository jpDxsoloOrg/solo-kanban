import { createSprint, getSprints } from "@/actions/sprint-actions";
import {
  allowOnly, apiRoute, created, ok, parseEnum, readBody, stringField, unwrap,
} from "@/lib/api/http";
import { requireProject, SPRINT_STATUSES, sprintJson } from "@/lib/api/resources";
import { MAX_SPRINT_GOAL_LENGTH, MAX_SPRINT_NAME_LENGTH } from "@/lib/limits";

export const dynamic = "force-dynamic";

type Params = { projectId: string };

/** Sprints: active first, then planned (oldest first), then completed (newest first). */
export const GET = apiRoute<Params>(async (req, { projectId }) => {
  await requireProject(projectId);
  const raw = req.nextUrl.searchParams.get("status");
  const status = raw ? parseEnum(raw, "status", SPRINT_STATUSES) : undefined;
  const sprints = await getSprints(projectId);
  return ok(sprints.filter((sprint) => !status || sprint.status === status).map(sprintJson));
});

/** Create a PLANNED sprint. Name defaults to "Sprint N"; dates are "YYYY-MM-DD". */
export const POST = apiRoute<Params>(async (req, { projectId }) => {
  await requireProject(projectId);
  const body = await readBody(req);
  allowOnly(body, ["name", "goal", "startDate", "endDate"]);
  const sprint = unwrap(
    await createSprint(projectId, {
      name: stringField(body, "name", { max: MAX_SPRINT_NAME_LENGTH }),
      goal: stringField(body, "goal", { max: MAX_SPRINT_GOAL_LENGTH, nullable: true }),
      startDate: stringField(body, "startDate", { max: 10, nullable: true }),
      endDate: stringField(body, "endDate", { max: 10, nullable: true }),
    }),
  );
  return created(sprintJson(sprint));
});
