import type { IssueStatus } from "@prisma/client";

/** Board columns, left to right. Shared by the board, cards and move menu. */
export const BOARD_COLUMNS: { status: IssueStatus; label: string }[] = [
  { status: "OPEN", label: "Open" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "REVIEW", label: "Review" },
  { status: "DONE", label: "Done" },
];

export const STATUS_LABELS: Record<IssueStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  REVIEW: "Review",
  DONE: "Done",
};

/** Small colored dot used to identify a status in tabs and menus. */
export const STATUS_DOT_CLASSES: Record<IssueStatus, string> = {
  OPEN: "bg-gray-400",
  IN_PROGRESS: "bg-blue-500",
  REVIEW: "bg-amber-500",
  DONE: "bg-green-500",
};

/** DOM id of a column, so the mobile status tabs can point at it. */
export function columnDomId(status: IssueStatus): string {
  return `board-column-${status.toLowerCase().replace("_", "-")}`;
}
