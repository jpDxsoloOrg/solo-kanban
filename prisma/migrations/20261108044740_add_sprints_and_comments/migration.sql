-- Run the whole migration as one transaction: if any statement fails, nothing
-- is left behind, and after `prisma migrate resolve --rolled-back` the next
-- deploy can simply apply it again. (Prisma doesn't wrap migrations itself.)
BEGIN;

-- CreateEnum
CREATE TYPE "SprintStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "sprintId" TEXT;

-- CreateTable
CREATE TABLE "Sprint" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT,
    "status" "SprintStatus" NOT NULL DEFAULT 'PLANNED',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "Sprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "issueId" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sprint_projectId_status_idx" ON "Sprint"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Sprint_projectId_number_key" ON "Sprint"("projectId", "number");

-- CreateIndex
CREATE INDEX "Comment_issueId_createdAt_idx" ON "Comment"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "Issue_sprintId_status_idx" ON "Issue"("sprintId", "status");

-- AddForeignKey
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data migration: give every existing project an active "Sprint 1" that holds
-- all of its current issues, so the board looks exactly as it did before the
-- upgrade. Completing that sprint is what clears out the DONE column.
-- Sprint dates are calendar dates stored at 12:00 UTC (src/lib/sprint-dates.ts);
-- it starts on the deploy's UTC day. It gets no end date: the server can't know
-- the user's time zone here, so a computed end would show a countdown that is
-- a day off for anyone behind UTC. The user sets it with "Edit" on the board.
-- ---------------------------------------------------------------------------
INSERT INTO "Sprint" ("id", "number", "name", "status", "startDate", "createdAt", "updatedAt", "projectId")
SELECT gen_random_uuid()::text, 1, 'Sprint 1', 'ACTIVE', d.start, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, p."id"
FROM "Project" p
CROSS JOIN (SELECT date_trunc('day', now() AT TIME ZONE 'UTC') + interval '12 hours' AS start) d;

UPDATE "Issue" i
SET "sprintId" = s."id"
FROM "Sprint" s
WHERE s."projectId" = i."projectId" AND s."number" = 1;

-- Column order is now scoped to (projectId, sprintId, status). Re-index it so
-- every column is a gap-free 0..n-1 sequence (earlier status edits could leave
-- duplicates or gaps behind).
UPDATE "Issue" i
SET "order" = sub.rn
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "projectId", "sprintId", "status"
           ORDER BY "order", "createdAt", "id"
         ) - 1 AS rn
  FROM "Issue"
) sub
WHERE i."id" = sub."id";

COMMIT;
