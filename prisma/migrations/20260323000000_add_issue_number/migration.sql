-- AlterTable: add number column as nullable first
ALTER TABLE "Issue" ADD COLUMN "number" INTEGER;

-- Backfill existing rows: assign sequential numbers per project
UPDATE "Issue" SET "number" = sub.row_num
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt") AS row_num
  FROM "Issue"
) sub
WHERE "Issue".id = sub.id;

-- Make the column required now that all rows have values
ALTER TABLE "Issue" ALTER COLUMN "number" SET NOT NULL;

-- AddUniqueConstraint
CREATE UNIQUE INDEX "Issue_projectId_number_key" ON "Issue"("projectId", "number");
