import type { Issue, Epic, Subtask } from "@prisma/client";

export type IssueWithRelations = Issue & {
  epic: Epic | null;
  subtasks: Subtask[];
};