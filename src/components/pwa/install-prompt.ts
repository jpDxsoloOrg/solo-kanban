"use client";

/**
 * Holds the browser's `beforeinstallprompt` event so an "Install app" button
 * can trigger it later. The event can fire before React hydrates, so the
 * inline script in the root layout stashes early ones on
 * `window.__installPrompt`; this store picks that up and listens for more.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __installPrompt?: BeforeInstallPromptEvent | null;
  }
}

let deferred: BeforeInstallPromptEvent | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  deferred = window.__installPrompt ?? null;

  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep the browser's mini-infobar out of the way; we offer a button.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    window.__installPrompt = null;
    emit();
  });
}

export function subscribeInstallPrompt(listener: () => void) {
  init();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferred;
}

export function getServerInstallPrompt(): BeforeInstallPromptEvent | null {
  return null;
}

/** Shows the browser's install dialog. Resolves true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  // The event can only be used once.
  deferred = null;
  window.__installPrompt = null;
  emit();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === "accepted";
}
