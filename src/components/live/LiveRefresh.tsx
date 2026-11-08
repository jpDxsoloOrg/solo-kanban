"use client";

import { useLiveRefresh } from "./useLiveRefresh";

/**
 * Refreshes the current page when data changes in another tab or on another
 * device. Mounted once by AppShell; renders nothing.
 */
export function LiveRefresh() {
  useLiveRefresh();
  return null;
}
