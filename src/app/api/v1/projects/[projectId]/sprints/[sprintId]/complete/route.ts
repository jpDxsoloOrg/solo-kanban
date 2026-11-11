import { completeSprint } from "@/actions/sprint-actions";
import {
  allowOnly, apiRoute, booleanField, ok, readBody, requireString, stringField, unwrap,
} from "@/lib/api/http";
import { requireSprint } from "@/lib/api/resources";

export const dynamic = "force-dynamic";

type Params = { projectId: string; sprintId: string };

/**
 * Complete the ACTIVE sprint. DONE issues stay with it; the rest move to
 * `moveIncompleteTo`: "new" (a new sprint), "backlog", or a planned sprint's
 * id. `startNext` starts that sprint right away.
 */
export const POST = apiRoute<Params>(async (req, { projectId, sprintId }) => {
  await requireSprint(projectId, sprintId);
  const body = await readBody(req);
  allowOnly(body, ["moveIncompleteTo", "startNext", "today"]);
  const summary = unwrap(
    await completeSprint(sprintId, {
      moveIncompleteTo: requireString(body, "moveIncompleteTo", { max: 100 }),
      startNext: booleanField(body, "startNext"),
      today: stringField(body, "today", { max: 10 }),
    }),
  );
  return ok(summary);
});
