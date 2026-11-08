"use client";

import { useHydrated } from "@/hooks/useHydrated";

const FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

interface LocalDateProps {
  date: Date | string;
  className?: string;
}

/**
 * A timestamp shown as a calendar date in the viewer's time zone. The server
 * (and hydration) render it in UTC, then it switches to local time once
 * mounted, so the markup never mismatches.
 */
export function LocalDate({ date, className }: LocalDateProps) {
  const hydrated = useHydrated();
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  const text = hydrated
    ? d.toLocaleDateString(undefined, FORMAT)
    : d.toLocaleDateString("en-US", { ...FORMAT, timeZone: "UTC" });

  return (
    <time dateTime={d.toISOString()} className={className}>
      {text}
    </time>
  );
}
