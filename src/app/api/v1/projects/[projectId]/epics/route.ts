import { prisma } from "@/lib/prisma";
import {
  allowOnly, apiRoute, created, ok, readBody, requireString, revalidateProject, stringField,
} from "@/lib/api/http";
import {
  epicJson, MAX_EPIC_NAME_LENGTH, MAX_PROJECT_DESCRIPTION_LENGTH, parseColor, requireProject,
} from "@/lib/api/resources";

export const dynamic = "force-dynamic";

type Params = { projectId: string };

export const GET = apiRoute<Params>(async (_req, { projectId }) => {
  await requireProject(projectId);
  const epics = await prisma.epic.findMany({ where: { projectId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return ok(epics.map(epicJson));
});

export const POST = apiRoute<Params>(async (req, { projectId }) => {
  await requireProject(projectId);
  const body = await readBody(req);
  allowOnly(body, ["name", "description", "color"]);
  const name = requireString(body, "name", { max: MAX_EPIC_NAME_LENGTH });
  const description = stringField(body, "description", { max: MAX_PROJECT_DESCRIPTION_LENGTH, nullable: true });
  const color = stringField(body, "color", { max: 7 });

  const epic = await prisma.epic.create({
    data: { projectId, name, description, ...(color && { color: parseColor(color) }) },
  });
  revalidateProject(projectId);
  return created(epicJson(epic));
});
