import { useSyncExternalStore } from "react";
import { todayInputValue } from "@/lib/sprint-dates";

function subscribeToDayChanges(onChange: () => void) {
  // Re-read the date when the tab comes back and once a minute, so "days
  // left" rolls over at midnight without a reload.
  const interval = window.setInterval(onChange, 60_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onChange);
  };
}

/**
 * Today's date in the browser's time zone ("YYYY-MM-DD"), or null while
 * rendering on the server and during hydration. Anything derived from it
 * (days left, overdue) therefore renders identically on server and client
 * first, then fills in — no hydration mismatch.
 */
export function useBrowserToday(): string | null {
  return useSyncExternalStore(subscribeToDayChanges, todayInputValue, () => null);
}
