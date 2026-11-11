import { prisma } from "@/lib/prisma";
import {
  allowOnly, apiRoute, badRequest, noContent, ok, readBody, revalidateProject, stringField,
} from "@/lib/api/http";
import {
  epicJson, MAX_EPIC_NAME_LENGTH, MAX_PROJECT_DESCRIPTION_LENGTH, parseColor, requireEpic,
} from "@/lib/api/resources";

export const dynamic = "force-dynamic";

type Params = { projectId: string; epicId: string };

export const GET = apiRoute<Params>(async (_req, { projectId, epicId }) => {
  return ok(epicJson(await requireEpic(projectId, epicId)));
});

export const PATCH = apiRoute<Params>(async (req, { projectId, epicId }) => {
  await requireEpic(projectId, epicId);
  const body = await readBody(req);
  allowOnly(body, ["name", "description", "color"]);
  const name = stringField(body, "name", { max: MAX_EPIC_NAME_LENGTH });
  const description = stringField(body, "description", { max: MAX_PROJECT_DESCRIPTION_LENGTH, nullable: true });
  const color = stringField(body, "color", { max: 7 });
  if (name === undefined && description === undefined && color === undefined) throw badRequest("Nothing to update.");

  const epic = await prisma.epic.update({
    where: { id: epicId },
    data: { name, description, ...(color && { color: parseColor(color) }) },
  });
  revalidateProject(projectId);
  return ok(epicJson(epic));
});

/** Delete an epic. Its issues are kept, without an epic. */
export const DELETE = apiRoute<Params>(async (_req, { projectId, epicId }) => {
  await requireEpic(projectId, epicId);
  await prisma.epic.delete({ where: { id: epicId } });
  revalidateProject(projectId);
  return noContent();
});
