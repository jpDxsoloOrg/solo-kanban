"use client";

import { useSyncExternalStore } from "react";

/**
 * A shared, coarse "current time" for relative timestamps. One interval
 * serves every subscriber, and it ticks again when the tab becomes visible
 * (background tabs throttle timers).
 *
 * Both hooks return their server value during SSR *and* hydration, then
 * re-render with the client value, so text that depends on the clock or the
 * browser's time zone never causes a hydration mismatch.
 */

const TICK_MS = 30_000;

let now: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function tick() {
  now = Date.now();
  listeners.forEach((listener) => listener());
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") tick();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    // A snapshot cached by a render that never committed may be stale;
    // React re-reads the snapshot after subscribing and re-renders if needed.
    if (now !== null && Date.now() - now >= TICK_MS) now = Date.now();
    timer = setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      // Start fresh next time something subscribes.
      now = null;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  };
}

function getNowSnapshot() {
  // Cached between ticks: useSyncExternalStore requires a stable snapshot.
  now ??= Date.now();
  return now;
}

function getServerNowSnapshot() {
  return null;
}

/** Current time in ms (refreshed every 30s), or null before hydration. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getNowSnapshot, getServerNowSnapshot);
}

function subscribeNever() {
  return () => {};
}

function getIsMac() {
  const platform = navigator.platform || navigator.userAgent;
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

/** Whether to show ⌘ (true) or Ctrl (false) in shortcut hints. */
export function useIsMac(): boolean {
  return useSyncExternalStore(subscribeNever, getIsMac, () => false);
}
