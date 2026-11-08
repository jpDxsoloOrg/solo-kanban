"use client";

import { useIsClient } from "./hooks";

interface LocalDateProps {
  /** An instant (e.g. `completedAt`), not a calendar sprint date. */
  value: Date | string;
  className?: string;
}

/**
 * Formats an instant in the viewer's time zone. The server (and hydration)
 * render the UTC date, then the client switches to local time, so the markup
 * always hydrates cleanly.
 */
export function LocalDate({ value, className }: LocalDateProps) {
  const isClient = useIsClient();
  const date = new Date(value);
  const text = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(!isClient && { timeZone: "UTC" }),
  });
  return (
    <time dateTime={date.toISOString()} className={className}>
      {text}
    </time>
  );
}
