"use client";

import { daysRemaining } from "@/lib/sprint-dates";
import { useBrowserToday } from "./hooks";
import { daysLeftLabel } from "./sprint-ui";

interface DaysLeftProps {
  endDate: Date | string | null | undefined;
  className?: string;
}

/**
 * "5 days left" / "Ends today" / "2 days overdue" for an active sprint.
 * Depends on the browser's date, so it renders nothing until after hydration.
 */
export function DaysLeft({ endDate, className = "" }: DaysLeftProps) {
  const today = useBrowserToday();
  if (!today) return null;
  const days = daysRemaining(endDate, today);
  if (days === null) return null;

  const { text, warning } = daysLeftLabel(days);
  return (
    <span
      className={`whitespace-nowrap ${
        warning ? "font-medium text-amber-700 dark:text-amber-400" : ""
      } ${className}`}
    >
      {text}
    </span>
  );
}
