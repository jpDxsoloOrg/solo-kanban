/**
 * Sprint start/end dates are *calendar dates*, not instants. To keep them
 * stable across time zones (server in UTC, browser anywhere) they are stored
 * as 12:00 UTC on the chosen day and always formatted in UTC. Noon UTC falls
 * on the same calendar day everywhere from UTC-11 to UTC+11.
 *
 * Safe to import from both server and client code.
 */

const DATE_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Default sprint length used when a sprint is started without an end date. */
export const DEFAULT_SPRINT_LENGTH_DAYS = 14;

/** Parse an `<input type="date">` value ("YYYY-MM-DD") into a stored Date. */
export function fromDateInputValue(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = DATE_INPUT_RE.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12));
  // Reject impossible dates such as 2026-02-31 that Date would roll over.
  if (date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return null;
  return date;
}

/** Format a stored sprint date as an `<input type="date">` value. */
export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** Today's calendar date in the *browser's* time zone, as "YYYY-MM-DD". */
export function todayInputValue(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today's UTC calendar date as a stored sprint date (server-side default). */
export function utcToday(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
}

/** Add whole days to a stored sprint date. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Human-readable sprint date, e.g. "Nov 20" or "Nov 20, 2027". */
export function formatSprintDate(
  date: Date | string | null | undefined,
  { withYear = false }: { withYear?: boolean } = {},
): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear && { year: "numeric" }),
    timeZone: "UTC",
  });
}

/** "Nov 8 – Nov 22" style range; either side may be missing. */
export function formatSprintRange(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): string {
  const s = formatSprintDate(start);
  const e = formatSprintDate(end);
  if (s && e) return `${s} – ${e}`;
  if (s) return `Started ${s}`;
  if (e) return `Ends ${e}`;
  return "";
}

/**
 * Whole calendar days from `today` (browser-local "YYYY-MM-DD", defaults to
 * now) until the sprint's end date. 0 = ends today, negative = overdue,
 * null = no end date.
 */
export function daysRemaining(
  endDate: Date | string | null | undefined,
  today: string = todayInputValue(),
): number | null {
  if (!endDate) return null;
  const end = fromDateInputValue(toDateInputValue(endDate));
  const now = fromDateInputValue(today);
  if (!end || !now) return null;
  return Math.round((end.getTime() - now.getTime()) / DAY_MS);
}
