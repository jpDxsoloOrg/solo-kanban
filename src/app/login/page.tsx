import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { signInWithGoogle } from "@/actions/auth-actions";
import { isAllowedEmail } from "@/lib/allowed-emails";
import { AppIcon } from "@/components/layout/AppIcon";

export const metadata: Metadata = {
  title: "Sign in",
};

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  AccessDenied: "That Google account isn't allowed to use this board.",
  Configuration: "Sign-in isn't set up correctly on the server. Check the AUTH_* settings.",
};

function GoogleLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;

  const session = await auth();
  if (isAllowedEmail(session?.user?.email)) redirect(callbackUrl?.startsWith("/") ? callbackUrl : "/");

  const message = error ? ERRORS[error] ?? "Sign-in failed. Please try again." : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-xl border border-border bg-background p-8 text-center shadow-sm">
        <AppIcon className="h-14 w-14" />
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">Sign in to Solo Kanban</h1>
          <p className="text-sm text-muted-foreground">Use your Google account to continue.</p>
        </div>

        {message && (
          <p role="alert" className="w-full rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {message}
          </p>
        )}

        <form action={signInWithGoogle} className="w-full">
          <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/"} />
          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center gap-3 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <GoogleLogo />
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}
