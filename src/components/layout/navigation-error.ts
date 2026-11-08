import { unstable_rethrow } from "next/navigation";

/**
 * True for the errors Next.js throws to redirect (or 404) out of a server
 * action. A client awaiting such an action sees the throw even though it
 * succeeded and navigation is under way, so it must not show an error.
 */
export function isNavigationError(error: unknown): boolean {
  try {
    unstable_rethrow(error);
    return false;
  } catch {
    return true;
  }
}
