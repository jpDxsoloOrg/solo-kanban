"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during SSR and hydration, true afterwards. Use it to render values
 * that depend on "now" or the browser's locale/time zone (relative times,
 * local dates) without a hydration mismatch: render a stable fallback until
 * this returns true.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
