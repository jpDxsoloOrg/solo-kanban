-- Optional longer markdown description for subtasks. Additive and nullable:
-- existing rows get NULL, no data is rewritten.
-- AlterTable
ALTER TABLE "Subtask" ADD COLUMN     "description" TEXT;
