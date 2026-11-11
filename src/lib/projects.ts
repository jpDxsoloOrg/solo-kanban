import { prisma } from "@/lib/prisma";
import {
  addDays,
  DEFAULT_SPRINT_LENGTH_DAYS,
  fromDateInputValue,
  utcToday,
} from "@/lib/sprint-dates";

/**
 * Create a project. Every project starts with an active sprint so the board
 * works right away. `today` is the caller's calendar date ("YYYY-MM-DD"), so
 * Sprint 1 starts on their day rather than the server's UTC day.
 */
export async function insertProject(name: string, description?: string | null, today?: string) {
  const startDate = fromDateInputValue(today) ?? utcToday();
  return prisma.project.create({
    data: {
      name,
      description,
      sprints: {
        create: {
          number: 1,
          name: "Sprint 1",
          status: "ACTIVE",
          startDate,
          endDate: addDays(startDate, DEFAULT_SPRINT_LENGTH_DAYS),
        },
      },
    },
  });
}
