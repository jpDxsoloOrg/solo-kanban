"use client";

import { useEffect } from "react";
import { subscribeInstallPrompt } from "./install-prompt";

/**
 * Registers /sw.js in production builds. In development it removes any
 * worker left over from a production run on the same origin, so stale
 * caches never shadow hot-reloaded code.
 */
export function ServiceWorkerRegistration() {
  // Start listening for beforeinstallprompt as early as possible.
  useEffect(() => subscribeInstallPrompt(() => {}), []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((error) => console.error("Service worker registration failed:", error));
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
