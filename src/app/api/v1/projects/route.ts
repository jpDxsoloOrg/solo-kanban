import { prisma } from "@/lib/prisma";
import { insertProject } from "@/lib/projects";
import { fromDateInputValue } from "@/lib/sprint-dates";
import {
  allowOnly, apiRoute, badRequest, created, ok, readBody, requireString, revalidateProject, stringField,
} from "@/lib/api/http";
import { MAX_PROJECT_DESCRIPTION_LENGTH, MAX_PROJECT_NAME_LENGTH, projectJson } from "@/lib/api/resources";

export const dynamic = "force-dynamic";

/** List projects, oldest first. */
export const GET = apiRoute(async () => {
  const projects = await prisma.project.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return ok(projects.map(projectJson));
});

/** Create a project. It starts with an active "Sprint 1". */
export const POST = apiRoute(async (req) => {
  const body = await readBody(req);
  allowOnly(body, ["name", "description", "today"]);
  const name = requireString(body, "name", { max: MAX_PROJECT_NAME_LENGTH });
  const description = stringField(body, "description", { max: MAX_PROJECT_DESCRIPTION_LENGTH, nullable: true });
  const today = stringField(body, "today", { max: 10 });
  if (today && !fromDateInputValue(today)) throw badRequest('"today" must be a date like "2026-11-11".');

  const project = await insertProject(name, description, today);
  revalidateProject(project.id);
  return created(projectJson(project));
});
