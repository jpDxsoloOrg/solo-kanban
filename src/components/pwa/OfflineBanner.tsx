"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { savedCopyAt, useSavedCopyAt } from "./saved-copy";

/** Succeeds only when the server and its database can be reached. */
const PROBE_URL = "/api/revision";
const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;

const savedAt = savedCopyAt;

/**
 * The page went offline and hasn't been refreshed since: it may be out of
 * date. Module scope: AppShell remounts on every client-side navigation.
 */
let wentOffline = false;

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}
const getOnline = () => navigator.onLine;
const getServerOnline = () => true;

const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "email", "tel", "number"]);

/**
 * Text fields typed into since the page went offline or the saved copy was
 * shown. (Typing can't be read off the DOM afterwards: React keeps a
 * controlled input's defaultValue in step with its value.)
 */
const typedFields = new Set<HTMLInputElement | HTMLTextAreaElement>();
let trackingInput = false;

function recordTyping(event: Event) {
  const field = event.target;
  if (
    field instanceof HTMLTextAreaElement ||
    (field instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(field.type))
  ) {
    typedFields.add(field);
  }
}

function startTrackingInput() {
  if (trackingInput) return;
  trackingInput = true;
  document.addEventListener("input", recordTyping, true);
}

/** Something typed while offline that reloading the document would discard. */
function hasUnsavedInput(): boolean {
  for (const field of typedFields) {
    if (!field.isConnected) {
      typedFields.delete(field);
      continue;
    }
    if (!field.disabled && !field.readOnly && field.value.trim() !== "") return true;
  }
  return false;
}


function formatSavedAt(value: string): string | null {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Says when the page is offline or is a saved copy, and brings it up to date
 * once the server can be reached again, whether or not live updates are on:
 * a saved copy is reloaded (its HTML, open forms and live-update baseline
 * all date from when it was saved), a page that was loaded online gets a
 * router.refresh(). Nothing is fetched while the page is online and current.
 */
export function OfflineBanner() {
  const router = useRouter();
  const online = useSyncExternalStore(subscribeOnline, getOnline, getServerOnline);
  const savedCopyTime = useSavedCopyAt();
  /** Back online on a saved copy with unsaved text: reloading is the user's call. */
  const [reloadBlocked, setReloadBlocked] = useState(false);

  useEffect(() => {
    let disposed = false;
    let checking = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // `online` only means a network is up: wait until the server answers,
    // or a reload would just get the saved copy again.
    async function check() {
      clearTimeout(timer);
      timer = undefined;
      if (disposed || checking || (savedAt === null && !wentOffline)) return;
      if (!navigator.onLine || document.visibilityState !== "visible") return;

      checking = true;
      let reachable = false;
      try {
        reachable = (await fetch(PROBE_URL, { cache: "no-store" })).ok;
      } catch {
        // Still offline.
      }
      checking = false;
      if (disposed) return;

      if (reachable) {
        if (savedAt !== null) {
          // A reload is the only way to get current data into a saved copy,
          // but it would throw away anything typed into it while offline.
          if (hasUnsavedInput()) setReloadBlocked(true);
          else window.location.reload();
        } else {
          wentOffline = false;
          typedFields.clear();
          router.refresh();
        }
        return;
      }
      failures += 1;
      timer = setTimeout(check, Math.min(RETRY_MIN_MS * 2 ** (failures - 1), RETRY_MAX_MS));
    }

    const handleOnline = () => {
      failures = 0;
      void check();
    };
    const handleOffline = () => {
      wentOffline = true;
      // Offline again: show the offline banner, not "Back online".
      setReloadBlocked(false);
      startTrackingInput();
      clearTimeout(timer);
      timer = undefined;
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void check();
    };

    if (!navigator.onLine) wentOffline = true;
    if (savedAt !== null || wentOffline) startTrackingInput();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    // A saved copy may already be back online (or the server was only
    // briefly unreachable): check at once.
    void check();

    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router]);

  const savedCopy = savedCopyTime !== null;
  const savedTime = savedCopy ? formatSavedAt(savedCopyTime) : null;

  if (reloadBlocked && online) {
    return (
      <div role="status" className="shrink-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
          <p className="min-w-0 flex-1">
            <span className="font-medium">Back online.</span>{" "}
            This is still the saved copy. Copy anything you typed, then reload to see the latest
            version.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-9 items-center rounded-md border border-sky-300 bg-background px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-sky-500/40"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div role="status" className="shrink-0">
      {(savedCopy || !online) && (
        <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="mt-0.5 h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20h.01M8.5 16.43a5 5 0 0 1 7 0M5 12.86a10 10 0 0 1 5.17-2.69M19 12.86a10 10 0 0 0-2-1.52M2 8.82a15 15 0 0 1 4.18-2.64M22 8.82a15 15 0 0 0-11.29-3.76M2 2l20 20" />
          </svg>
          <p className="min-w-0">
            <span className="font-medium">
              {savedCopy ? "Offline — showing a saved copy" : "You're offline"}
            </span>{" "}
            <span className="block text-xs text-amber-800 sm:inline sm:text-sm dark:text-amber-200/80">
              {savedTime && `Saved ${savedTime}. `}
              Changes can&apos;t be saved until you reconnect.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
