"use client";

import { useState, useSyncExternalStore } from "react";
import {
  getInstallPrompt,
  getServerInstallPrompt,
  promptInstall,
  subscribeInstallPrompt,
} from "./install-prompt";

/**
 * "Install app" button, shown only when the browser offers installation
 * (Chromium's beforeinstallprompt). Hidden when already installed or when
 * the browser has no such API (e.g. iOS Safari).
 */
export function InstallAppButton() {
  const installEvent = useSyncExternalStore(
    subscribeInstallPrompt,
    getInstallPrompt,
    getServerInstallPrompt
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!installEvent && !error) return null;

  const handleInstall = async () => {
    setPending(true);
    setError(null);
    try {
      await promptInstall();
    } catch (err) {
      console.error("Install prompt failed:", err);
      setError("Couldn't open the install dialog.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {installEvent && (
        <button
          type="button"
          onClick={handleInstall}
          disabled={pending}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 pointer-fine:h-9"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />
          </svg>
          Install app
        </button>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
