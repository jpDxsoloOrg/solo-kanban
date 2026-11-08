"use client";

import { useSyncExternalStore } from "react";

/**
 * Per-device "Live updates" preference, kept in localStorage so a phone and
 * a desktop (or a wall display) can be set differently. Off by default: no
 * change polling happens until the user turns it on.
 */

export interface LiveSettings {
  enabled: boolean;
  /** Milliseconds between change checks while the page is visible. */
  intervalMs: number;
}

export const LIVE_INTERVAL_OPTIONS: { ms: number; label: string }[] = [
  { ms: 5_000, label: "5 seconds" },
  { ms: 10_000, label: "10 seconds" },
  { ms: 30_000, label: "30 seconds" },
  { ms: 60_000, label: "1 minute" },
  { ms: 5 * 60_000, label: "5 minutes" },
  { ms: 10 * 60_000, label: "10 minutes" },
];

/**
 * Neon suspends compute after 5 minutes without queries. Checking more often
 * than that keeps the database awake for as long as a tab is visible.
 */
export const DATABASE_SLEEP_AFTER_MS = 5 * 60_000;

const STORAGE_KEY = "live-updates";
export const DEFAULT_LIVE_SETTINGS: LiveSettings = { enabled: false, intervalMs: 10_000 };

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedValue: LiveSettings = DEFAULT_LIVE_SETTINGS;
/** In-memory fallback when localStorage is unavailable (e.g. blocked). */
let memoryValue: LiveSettings | null = null;
/** Set when live updates go from off to on; the next check refreshes once. */
let refreshOnNextCheck = false;

function normalize(value: unknown): LiveSettings {
  if (typeof value !== "object" || value === null) return DEFAULT_LIVE_SETTINGS;
  const { enabled, intervalMs } = value as Partial<LiveSettings>;
  const option = LIVE_INTERVAL_OPTIONS.find((o) => o.ms === intervalMs);
  return {
    enabled: enabled === true,
    intervalMs: option?.ms ?? DEFAULT_LIVE_SETTINGS.intervalMs,
  };
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Snapshot for useSyncExternalStore: stable identity until the value changes. */
function getSnapshot(): LiveSettings {
  if (memoryValue) return memoryValue;
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedValue = raw ? normalize(JSON.parse(raw)) : DEFAULT_LIVE_SETTINGS;
    } catch {
      cachedValue = DEFAULT_LIVE_SETTINGS;
    }
  }
  return cachedValue;
}

function getServerSnapshot(): LiveSettings {
  return DEFAULT_LIVE_SETTINGS;
}

function notify(previous: LiveSettings) {
  const next = getSnapshot();
  if (!previous.enabled && next.enabled) refreshOnNextCheck = true;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab in this browser changed the setting.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    const previous = cachedValue;
    notify(previous);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setLiveSettings(patch: Partial<LiveSettings>): void {
  const previous = getSnapshot();
  const next = normalize({ ...previous, ...patch });
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    memoryValue = null;
  } catch {
    memoryValue = next;
  }
  notify(previous);
}

/** True once after live updates were switched on (consumes the flag). */
export function consumeRefreshOnEnable(): boolean {
  const value = refreshOnNextCheck;
  refreshOnNextCheck = false;
  return value;
}

/** Current settings; the server and hydration render the default (off). */
export function useLiveSettings(): LiveSettings {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function intervalLabel(ms: number): string {
  return LIVE_INTERVAL_OPTIONS.find((o) => o.ms === ms)?.label ?? `${Math.round(ms / 1000)} seconds`;
}
