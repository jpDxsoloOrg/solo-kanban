"use client";

import { useSyncExternalStore } from "react";

/**
 * Which Overview rows are open, keyed by row id (epic id, `none:<projectId>`,
 * or `done:<row key>` for "show all done"). Kept outside React so it survives
 * router.refresh() and re-renders with new data, and mirrored to
 * sessionStorage so it is still there after opening an issue and going back.
 * Renders collapsed on the server and during hydration, so markup matches.
 */

const STORAGE_KEY = "overview:expanded";
const EMPTY: ReadonlySet<string> = new Set();

let current: ReadonlySet<string> | null = null;
const listeners = new Set<() => void>();

function read(): ReadonlySet<string> {
  if (current) return current;
  let keys: string[] = [];
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    if (Array.isArray(parsed)) keys = parsed.filter((key): key is string => typeof key === "string");
  } catch {
    // Storage blocked or corrupt: start collapsed.
  }
  current = new Set(keys);
  return current;
}

function write(next: ReadonlySet<string>) {
  current = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  } catch {
    // Not persisted; still works for this page view.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useExpandedKeys(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function setExpanded(keys: Iterable<string>, open: boolean) {
  const next = new Set(read());
  for (const key of keys) {
    if (open) next.add(key);
    else next.delete(key);
  }
  write(next);
}

export function toggleExpanded(key: string) {
  setExpanded([key], !read().has(key));
}
