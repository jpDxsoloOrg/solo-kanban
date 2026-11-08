"use client";

import { useLiveRefresh } from "./useLiveRefresh";
import { useLiveSettings } from "./live-settings";

/**
 * Refreshes the current page when data changes in another tab or on another
 * device, if "Live updates" is switched on for this device. Mounted once by
 * AppShell; renders nothing.
 */
export function LiveRefresh() {
  useLiveRefresh(useLiveSettings());
  return null;
}
