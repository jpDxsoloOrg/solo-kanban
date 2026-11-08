"use client";

import { useSyncExternalStore } from "react";

/**
 * Desktop sidebar collapsed state.
 *
 * The source of truth is `data-sidebar="collapsed"` on <html>: the inline
 * script in the root layout sets it from localStorage before first paint, and
 * CSS (the `sidebar-collapsed:` variant) drives the layout from it. That keeps
 * the state across page navigations (each page mounts its own AppShell) with
 * no flash. React only mirrors it for aria attributes.
 */

const STORAGE_KEY = "sidebar";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return document.documentElement.dataset.sidebar === "collapsed";
}

function getServerSnapshot(): boolean {
  return false;
}

export function setSidebarCollapsed(collapsed: boolean) {
  const root = document.documentElement;
  if (collapsed) root.dataset.sidebar = "collapsed";
  else delete root.dataset.sidebar;
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // Storage can be unavailable (private mode); the state still applies.
  }
  listeners.forEach((listener) => listener());
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
