"use client";

import { useState, useTransition } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { signOutAction } from "@/actions/auth-actions";

/** Pages the service worker saved for offline use (see public/sw.js). */
const PAGES_CACHE_PREFIX = "solo-kanban-pages-";

async function clearSavedPages() {
  if (typeof caches === "undefined") return;
  try {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(PAGES_CACHE_PREFIX)).map((name) => caches.delete(name)));
  } catch {
    // Best effort: the session cookie is what actually signs you out.
  }
}

function Account() {
  const { data } = useSession();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const email = data?.user?.email;

  const handleSignOut = () => {
    setError(null);
    startTransition(async () => {
      // Offline copies of pages hold board data: don't leave them behind.
      await clearSavedPages();
      try {
        await signOutAction();
      } catch (err) {
        // signOut redirects by throwing; only real failures land here.
        if (err && typeof err === "object" && "digest" in err && String(err.digest).startsWith("NEXT_REDIRECT")) throw err;
        console.error("Sign out failed:", err);
        setError("Couldn't sign out. Check your connection.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={email ?? undefined}>
          {email ?? "Signed in"}
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={pending}
          className="inline-flex h-9 shrink-0 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 pointer-fine:h-7"
        >
          {pending ? "Signing out…" : "Sign out"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Signed-in account and a sign-out button, for the sidebar footer. */
export function AccountMenu() {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <Account />
    </SessionProvider>
  );
}
