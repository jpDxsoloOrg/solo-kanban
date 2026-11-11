import { prisma } from "@/lib/prisma";
import {
  allowOnly, apiRoute, badRequest, noContent, ok, readBody, revalidateProject, stringField,
} from "@/lib/api/http";
import {
  MAX_PROJECT_DESCRIPTION_LENGTH, MAX_PROJECT_NAME_LENGTH, projectJson, requireProject, sprintJson,
} from "@/lib/api/resources";

export const dynamic = "force-dynamic";

type Params = { projectId: string };

/** A project with its active sprint and issue counts by status. */
export const GET = apiRoute<Params>(async (_req, { projectId }) => {
  const project = await requireProject(projectId);
  const [activeSprint, counts] = await Promise.all([
    prisma.sprint.findFirst({ where: { projectId, status: "ACTIVE" }, orderBy: { number: "desc" } }),
    prisma.issue.groupBy({ by: ["status"], where: { projectId }, _count: { _all: true } }),
  ]);
  const issueCounts = { OPEN: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 };
  for (const row of counts) issueCounts[row.status] = row._count._all;
  return ok({
    ...projectJson(project),
    activeSprint: activeSprint && sprintJson(activeSprint),
    issueCounts,
  });
});

/** Rename a project or change its description. */
export const PATCH = apiRoute<Params>(async (req, { projectId }) => {
  await requireProject(projectId);
  const body = await readBody(req);
  allowOnly(body, ["name", "description"]);
  const name = stringField(body, "name", { max: MAX_PROJECT_NAME_LENGTH });
  const description = stringField(body, "description", { max: MAX_PROJECT_DESCRIPTION_LENGTH, nullable: true });
  if (name === undefined && description === undefined) throw badRequest("Nothing to update.");

  const project = await prisma.project.update({ where: { id: projectId }, data: { name, description } });
  revalidateProject(projectId);
  return ok(projectJson(project));
});

/** Delete a project with all of its issues, epics, sprints and comments. */
export const DELETE = apiRoute<Params>(async (_req, { projectId }) => {
  await requireProject(projectId);
  await prisma.project.delete({ where: { id: projectId } });
  revalidateProject(projectId);
  return noContent();
});
