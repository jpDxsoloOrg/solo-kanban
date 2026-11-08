import type { Metadata } from "next";
import { AppIcon } from "@/components/layout/AppIcon";
import { RetryButton } from "./RetryButton";

export const metadata: Metadata = {
  title: "Offline",
};

// Precached by the service worker and served when a page can't be loaded.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
      <AppIcon className="h-14 w-14" />
      <h1 className="text-xl font-semibold text-foreground">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This page isn&apos;t available without a connection. Check your network and
        try again &mdash; pages you&apos;ve opened recently still work offline.
      </p>
      <RetryButton />
    </main>
  );
}
