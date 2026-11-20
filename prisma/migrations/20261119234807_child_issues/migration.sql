-- Child issues (Jira-style subtasks). Additive only: two new columns, an
-- index and a self-referencing FK. Existing rows get parentId NULL and
-- childOrder 0; no data is rewritten. Deleting a parent sets its children's
-- parentId to NULL (it never deletes them). The legacy "Subtask" table is
-- untouched.
-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "childOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "Issue_parentId_childOrder_idx" ON "Issue"("parentId", "childOrder");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
