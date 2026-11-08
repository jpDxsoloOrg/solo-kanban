import type { IssuePriority, IssueStatus, SprintStatus } from "@prisma/client";

/**
 * Labels and chip colors shared by the sprint screens. Safe to import from
 * server and client components. Every color pair has a dark-mode variant.
 */

export const ISSUE_STATUS_ORDER: IssueStatus[] = ["OPEN", "IN_PROGRESS", "REVIEW", "DONE"];

export const issueStatusLabel: Record<IssueStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  REVIEW: "Review",
  DONE: "Done",
};

export const issueStatusClass: Record<IssueStatus, string> = {
  OPEN: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  REVIEW: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  DONE: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
};

export const PRIORITY_ORDER: IssuePriority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];

export const priorityLabel: Record<IssuePriority, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export const priorityClass: Record<IssuePriority, string> = {
  URGENT: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  MEDIUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  LOW: "bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300",
};

/** Bar color for priority breakdowns. */
export const priorityBarClass: Record<IssuePriority, string> = {
  URGENT: "bg-red-500",
  HIGH: "bg-orange-500",
  MEDIUM: "bg-yellow-500",
  LOW: "bg-gray-400",
};

export const sprintStatusLabel: Record<SprintStatus, string> = {
  ACTIVE: "Active",
  PLANNED: "Planned",
  COMPLETED: "Completed",
};

export const sprintStatusClass: Record<SprintStatus, string> = {
  ACTIVE: "bg-primary/10 text-primary",
  PLANNED: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
};

/** Base classes for the small rounded chips used in issue rows. */
export const chipClass =
  "inline-flex max-w-full items-center rounded px-1.5 py-0.5 text-xs font-medium";

/** "1 issue" / "3 issues". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Text + tone for a sprint's days remaining (see `daysRemaining`). */
export function daysLeftLabel(days: number): { text: string; warning: boolean } {
  if (days > 0) return { text: `${pluralize(days, "day")} left`, warning: false };
  if (days === 0) return { text: "Ends today", warning: true };
  return { text: `${pluralize(-days, "day")} overdue`, warning: true };
}

/** Native `<select>` styling that matches the UI kit inputs in both themes. */
export const nativeSelectClass =
  "rounded-md border border-input-border bg-background text-foreground text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 " +
  "dark:[color-scheme:dark]";

/** Keeps kit modals inside the viewport on phones (they are full-width by default). */
export const dialogClass =
  "w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6";

/** Visible keyboard focus ring for plain links and buttons. */
export const focusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
