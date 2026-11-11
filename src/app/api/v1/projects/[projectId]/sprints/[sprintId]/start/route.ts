import { startSprint } from "@/actions/sprint-actions";
import { allowOnly, apiRoute, ok, readOptionalBody, stringField, unwrap } from "@/lib/api/http";
import { requireSprint, sprintJson } from "@/lib/api/resources";

export const dynamic = "force-dynamic";

type Params = { projectId: string; sprintId: string };

/**
 * Start a PLANNED sprint. Fails if another sprint is active. Start date
 * defaults to today, end date to start + 14 days.
 */
export const POST = apiRoute<Params>(async (req, { projectId, sprintId }) => {
  await requireSprint(projectId, sprintId);
  const body = await readOptionalBody(req);
  allowOnly(body, ["startDate", "endDate"]);
  const sprint = unwrap(
    await startSprint(sprintId, {
      startDate: stringField(body, "startDate", { max: 10, nullable: true }),
      endDate: stringField(body, "endDate", { max: 10, nullable: true }),
    }),
  );
  return ok(sprintJson(sprint));
});
