"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

/**
 * public/sw.js adds this to pages it serves from its cache because the
 * network failed; its content is when the copy was saved ("" if unknown).
 */
const SAVED_COPY_SELECTOR = 'meta[name="sk-saved-copy"]';
/** Succeeds only when the server and its database can be reached. */
const PROBE_URL = "/api/revision";
const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;

/**
 * When this document is a saved copy: its save time, else null. Read before
 * hydration, and fixed for the life of the document (client-side
 * navigations keep it).
 */
const savedAt: string | null =
  typeof document === "undefined"
    ? null
    : (document.querySelector<HTMLMetaElement>(SAVED_COPY_SELECTOR)?.content ?? null);

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

/** Text fields whose content would be lost by reloading the document. */
const TEXT_FIELDS =
  'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="url"], input[type="email"], input[type="tel"], input[type="number"]';

/**
 * Field values when the saved copy was shown (or the page went offline).
 * React keeps a controlled input's defaultValue in sync with its value, so
 * typing can't be detected from the DOM alone; compare with this snapshot.
 */
let fieldBaseline = new WeakMap<Element, string>();

function snapshotFields() {
  fieldBaseline = new WeakMap();
  for (const field of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(TEXT_FIELDS)) {
    fieldBaseline.set(field, field.value);
  }
}

/** The user typed something (or has a dialog open) that a reload would discard. */
function hasUnsavedInput(): boolean {
  if (document.querySelector('[aria-modal="true"]')) return true;
  for (const field of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(TEXT_FIELDS)) {
    if (field.disabled || field.readOnly) continue;
    if (field.value !== (fieldBaseline.get(field) ?? "")) return true;
  }
  return false;
}

const subscribeNever = () => () => {};
const getSavedAt = () => savedAt;
const getServerSavedAt = () => null;

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
  const savedCopyAt = useSyncExternalStore(subscribeNever, getSavedAt, getServerSavedAt);
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
      snapshotFields();
      clearTimeout(timer);
      timer = undefined;
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void check();
    };

    if (!navigator.onLine) wentOffline = true;
    if (savedAt !== null || wentOffline) snapshotFields();
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

  const savedCopy = savedCopyAt !== null;
  const savedTime = savedCopy ? formatSavedAt(savedCopyAt) : null;

  if (reloadBlocked) {
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
