import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Every table the UI renders. Each has an `updatedAt` column that Prisma
 * stamps on create, update *and* updateMany (e.g. the order shifts when a
 * card moves), so any user-visible change touches at least one of them.
 */
const TABLES = ["Project", "Epic", "Sprint", "Issue", "Subtask", "Comment"] as const;

/**
 * Per table:
 * - row count: catches deletes, including cascades and SET NULLs that don't
 *   touch the surviving rows (deleting an epic or a sprint);
 * - newest `updatedAt`: catches creates and edits;
 * - sum of all `updatedAt` values in ms: also catches an edit stamped below
 *   the current max (servers with slightly skewed clocks, same-millisecond
 *   writes). Integer arithmetic, so the same data always gives the same text.
 */
function tableState(table: (typeof TABLES)[number]) {
  return Prisma.sql`(
    SELECT concat_ws(':', count(*), max("updatedAt"), sum(floor(extract(epoch FROM "updatedAt") * 1000)::bigint))
    FROM ${Prisma.raw(`"${table}"`)}
  )`;
}

const REVISION_QUERY = Prisma.sql`SELECT concat_ws('|', ${Prisma.join(TABLES.map(tableState))}) AS state`;

/**
 * A short token that changes whenever any data changes, across all projects.
 * Clients poll it (GET /api/revision) and refresh the page when it moves.
 * One database round trip; a single user's data is small enough that the
 * aggregate scans stay cheap.
 */
export async function getRevision(): Promise<string> {
  const [row] = await prisma.$queryRaw<{ state: string }[]>(REVISION_QUERY);
  return createHash("sha1").update(row?.state ?? "").digest("base64url").slice(0, 16);
}
