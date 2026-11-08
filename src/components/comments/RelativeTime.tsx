"use client";

import { useNow } from "./useNow";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "just now", "5m ago", "3h ago", "2d ago", then "Nov 2" (or "Nov 2, 2025"). */
export function formatRelativeTime(date: Date, now: number): string {
  // Clamp small clock skew (a just-posted comment can be "in the future").
  const elapsed = Math.max(0, now - date.getTime());
  if (elapsed < MINUTE_MS) return "just now";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h ago`;
  if (elapsed < 7 * DAY_MS) return `${Math.floor(elapsed / DAY_MS)}d ago`;

  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(!sameYear && { year: "numeric" }),
  });
}

/** Full local date and time, e.g. "Nov 8, 2026, 3:04 PM". */
export function formatFullDateTime(date: Date): string {
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

interface RelativeTimeProps {
  date: Date | string;
  className?: string;
}

/**
 * A <time> showing how long ago `date` was, with the full local date/time in
 * its tooltip. Renders empty on the server and during hydration (the text
 * depends on the clock and time zone), then fills in and refreshes itself.
 */
export function RelativeTime({ date, className }: RelativeTimeProps) {
  const now = useNow();
  const value = new Date(date);

  return (
    <time
      dateTime={value.toISOString()}
      title={now === null ? undefined : formatFullDateTime(value)}
      className={className}
    >
      {now === null ? "" : formatRelativeTime(value, now)}
    </time>
  );
}
