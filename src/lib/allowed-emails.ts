/**
 * Who may sign in: the Google accounts listed in ALLOWED_EMAILS
 * (comma-separated, case-insensitive). With the list empty nobody can sign
 * in, so a fresh deployment is never open to every Google account.
 *
 * Safe for the edge runtime (used by the middleware).
 */
export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails().includes(email.trim().toLowerCase());
}
