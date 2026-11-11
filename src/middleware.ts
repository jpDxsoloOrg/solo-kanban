import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAllowedEmail } from "@/lib/allowed-emails";

/**
 * Every page, server action and internal API route requires a signed-in,
 * allowed Google account. Unauthenticated page loads go to /login; other
 * requests (fetches, server actions) get a 401.
 *
 * Not covered (see `config.matcher`): the sign-in flow itself, the public
 * API (/api/v1, which uses API keys) and its docs, and the files the PWA
 * needs before sign-in (offline page, manifest, icons, service worker).
 */
export default auth((req) => {
  if (isAllowedEmail(req.auth?.user?.email)) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  const isPageLoad =
    req.method === "GET" &&
    !pathname.startsWith("/api/") &&
    !req.headers.has("next-action");

  if (!isPageLoad) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const login = new URL("/login", req.nextUrl.origin);
  if (pathname !== "/") login.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(login);
});

export const config = {
  matcher: [
    "/((?!login|offline|api/auth|api/v1|api/docs|_next/static|_next/image|icons/|sw\\.js|manifest\\.webmanifest|favicon\\.ico).*)",
  ],
};
