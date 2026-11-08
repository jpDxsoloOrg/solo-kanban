"use client";

import { useId } from "react";
import { Select, Toggle } from "@dxsolo/ui";
import {
  DATABASE_SLEEP_AFTER_MS,
  LIVE_INTERVAL_OPTIONS,
  intervalLabel,
  setLiveSettings,
  useLiveSettings,
} from "./live-settings";

/**
 * Sidebar switch for "Live updates" plus the check interval. The setting is
 * per device; with it off the app never polls.
 */
export function LiveUpdatesControl() {
  const { enabled, intervalMs } = useLiveSettings();
  const hintId = useId();
  const keepsDatabaseAwake = intervalMs <= DATABASE_SLEEP_AFTER_MS;

  return (
    <div className="flex flex-col gap-2">
      <Toggle
        checked={enabled}
        onCheckedChange={(checked) => setLiveSettings({ enabled: checked })}
        label="Live updates"
        size="sm"
        aria-describedby={hintId}
      />
      {enabled && (
        <Select
          label="Check for changes every"
          value={String(intervalMs)}
          onChange={(e) => setLiveSettings({ intervalMs: Number(e.target.value) })}
          aria-describedby={hintId}
        >
          {LIVE_INTERVAL_OPTIONS.map((option) => (
            <option key={option.ms} value={option.ms}>
              {option.label}
            </option>
          ))}
        </Select>
      )}
      <p id={hintId} className="text-xs leading-snug text-muted-foreground">
        {enabled
          ? `Shows changes from other tabs and devices, checking every ${intervalLabel(intervalMs)} while this tab is visible. ${
              keepsDatabaseAwake
                ? "The database stays awake while it's on."
                : "The database can sleep between checks."
            }`
          : "Off on this device. Pages show changes from elsewhere when you reload or navigate."}
      </p>
    </div>
  );
}

/** Small "Live" badge shown wherever live updates are on. */
export function LiveIndicator({ className = "" }: { className?: string }) {
  const { enabled, intervalMs } = useLiveSettings();
  if (!enabled) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300 ${className}`}
      title={`Live updates on: checking every ${intervalLabel(intervalMs)}`}
    >
      <span aria-hidden="true" className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
      </span>
      Live
    </span>
  );
}
