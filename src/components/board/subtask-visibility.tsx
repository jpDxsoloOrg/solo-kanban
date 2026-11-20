"use client";

import { useSyncExternalStore } from "react";

/**
 * "Show subtasks": whether child issues get their own cards and rows on the
 * board, backlog and sprint lists. Off by default; remembered per browser.
 * Every view reads the same setting, so flipping it in one place applies
 * everywhere (and in other open tabs).
 */

const STORAGE_KEY = "show-subtasks";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setShowSubtasks(show: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, show ? "on" : "off");
  } catch {
    // Storage can be unavailable (private mode); nothing to remember then.
  }
  listeners.forEach((listener) => listener());
}

export function useShowSubtasks(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

interface Nestable {
  id: string;
  parentId: string | null;
}

/**
 * The issues a view lists. With subtasks hidden, a child is left out when
 * its parent is in the same list (the parent's card counts it); a child
 * whose parent is elsewhere (another sprint, the backlog, done) still shows,
 * so no work disappears from view.
 */
export function visibleIssues<T extends Nestable>(issues: T[], showSubtasks: boolean, all: Nestable[] = issues): T[] {
  if (showSubtasks) return issues;
  const listed = new Set(all.map((issue) => issue.id));
  return issues.filter((issue) => !issue.parentId || !listed.has(issue.parentId));
}

/** Whether any issue here is a child issue, i.e. whether the toggle matters. */
export function hasSubtasks(issues: Nestable[]): boolean {
  return issues.some((issue) => issue.parentId !== null);
}

/** The "Show subtasks" switch. */
export function ShowSubtasksToggle({ className = "" }: { className?: string }) {
  const show = useShowSubtasks();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={show}
      onClick={() => setShowSubtasks(!show)}
      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 ${className}`}
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
          show ? "bg-primary" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`absolute h-3 w-3 rounded-full bg-background shadow transition-transform ${
            show ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
      Show subtasks
    </button>
  );
}
