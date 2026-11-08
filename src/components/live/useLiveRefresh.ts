"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { isLiveRefreshHeld, onLiveRefreshHoldsReleased } from "./live-refresh-hold";
import { consumeRefreshOnEnable, type LiveSettings } from "./live-settings";

const REVISION_URL = "/api/revision";
/** Error backoff doubles from the chosen interval up to this (or the interval, if longer). */
const MAX_BACKOFF_MS = 60_000;
/** Focus/visibility/online checks closer together than this are skipped. */
const MIN_CHECK_GAP_MS = 1_000;

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/**
 * The last revision this tab has seen. Module scope, so it survives the
 * AppShell remount that comes with every client-side navigation: a change
 * made between the last poll and the new page's first poll still triggers a
 * refresh. Only a full page load starts without one (the first response then
 * just sets the baseline).
 */
let knownRevision: string | null = null;

/**
 * A refresh was still waiting for the user when the page went away. Back /
 * forward navigations can restore a page from the router cache, so the next
 * page refreshes once to be safe.
 */
let refreshPendingAcrossNavigation = false;

/**
 * Focus is somewhere the user types. A focused <select> doesn't count: it
 * commits on change and holds no unsaved text, and it keeps focus after a
 * pick, so counting it would defer refreshes until the user clicks elsewhere.
 */
function isEditing(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(element.type);
  return false;
}

/**
 * Keeps the current page in sync with changes made elsewhere (another tab,
 * another device) by polling a change token and calling router.refresh()
 * when it moves. Server components re-render with fresh data; client state
 * (open forms, drafts, selected tabs) survives because nothing remounts.
 *
 * - Does nothing unless the user turned "Live updates" on (per device, see
 *   live-settings.ts). Then polls at the chosen interval while the page is
 *   visible and online, checks at once on focus, visibility and reconnect,
 *   and refreshes once right after being switched on.
 * - Never more than one request in flight; exponential backoff on errors.
 * - Defers the refresh while the user is mid-interaction (typing, a modal
 *   open, dragging a card, an optimistic move saving) and applies it as soon
 *   as they're done.
 */
export function useLiveRefresh({ enabled, intervalMs }: LiveSettings): void {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: AbortController | null = null;
    let failures = 0;
    let lastCheckAt = 0;
    let dragging = false;
    /**
     * A newer revision was seen (or live updates were just switched on, so
     * the page may be stale); the refresh waits for the user.
     */
    let pendingRefresh = refreshPendingAcrossNavigation || consumeRefreshOnEnable();
    refreshPendingAcrossNavigation = false;
    let stopWatchingForIdle: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const canPoll = () => document.visibilityState === "visible" && navigator.onLine;

    const isBusy = () =>
      dragging ||
      isLiveRefreshHeld() ||
      document.querySelector('[aria-modal="true"]') !== null ||
      isEditing(document.activeElement);

    const nextDelay = () => {
      if (failures === 0) return intervalMs;
      const cap = Math.max(intervalMs, MAX_BACKOFF_MS);
      return Math.min(intervalMs * 2 ** failures, cap);
    };

    const schedule = () => {
      clearTimeout(timer);
      timer = undefined;
      if (disposed || inFlight || !canPoll()) return;
      const wait = Math.max(0, lastCheckAt + nextDelay() - Date.now());
      timer = setTimeout(check, wait);
    };

    const applyRefresh = () => {
      if (disposed || !pendingRefresh) return;
      if (isBusy()) {
        watchForIdle();
        return;
      }
      pendingRefresh = false;
      stopWatchingForIdle?.();
      stopWatchingForIdle = null;
      router.refresh();
    };

    // Re-check soon (after the event that may have ended the interaction
    // has been handled), coalescing bursts into one check.
    const applySoon = () => {
      if (retryTimer !== undefined) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        applyRefresh();
      }, 0);
    };

    /** Listen for the end of whatever is keeping the user busy. */
    const watchForIdle = () => {
      if (stopWatchingForIdle) return;
      // Dialogs come and go as DOM nodes (portals) or aria-modal flips.
      const observer = new MutationObserver(applySoon);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-modal"],
      });
      document.addEventListener("focusout", applySoon);
      const stopHoldListener = onLiveRefreshHoldsReleased(applySoon);
      stopWatchingForIdle = () => {
        observer.disconnect();
        document.removeEventListener("focusout", applySoon);
        stopHoldListener();
      };
    };

    async function check() {
      clearTimeout(timer);
      timer = undefined;
      if (disposed || inFlight || !canPoll()) return;

      const controller = new AbortController();
      inFlight = controller;
      try {
        const response = await fetch(REVISION_URL, {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Revision check failed (${response.status})`);
        const body: unknown = await response.json();
        const revision =
          typeof body === "object" && body !== null && "revision" in body ? body.revision : null;
        if (typeof revision !== "string") throw new Error("Malformed revision response");

        failures = 0;
        if (knownRevision === null) {
          knownRevision = revision;
        } else if (revision !== knownRevision) {
          knownRevision = revision;
          pendingRefresh = true;
        }
      } catch {
        if (controller.signal.aborted) return;
        failures += 1;
      } finally {
        if (inFlight === controller) inFlight = null;
        lastCheckAt = Date.now();
      }

      if (disposed) return;
      if (pendingRefresh) applyRefresh();
      schedule();
    }

    /** Check right away, unless one just ran or is running. */
    const checkNow = () => {
      if (Date.now() - lastCheckAt < MIN_CHECK_GAP_MS) {
        schedule();
        return;
      }
      void check();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkNow();
      } else {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    const handleOnline = () => {
      failures = 0;
      checkNow();
    };

    const handleOffline = () => {
      clearTimeout(timer);
      timer = undefined;
    };

    const stopDragMonitor = monitorForElements({
      onDragStart: () => {
        dragging = true;
      },
      onDrop: () => {
        dragging = false;
        // Let the drop handlers start their optimistic move (and hold) first.
        if (pendingRefresh) applySoon();
      },
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", checkNow);
    window.addEventListener("pageshow", checkNow);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    void check();

    return () => {
      disposed = true;
      if (pendingRefresh) refreshPendingAcrossNavigation = true;
      clearTimeout(timer);
      clearTimeout(retryTimer);
      inFlight?.abort();
      stopWatchingForIdle?.();
      stopDragMonitor();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", checkNow);
      window.removeEventListener("pageshow", checkNow);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [router, enabled, intervalMs]);
}
