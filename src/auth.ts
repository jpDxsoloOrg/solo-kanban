import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedEmail } from "@/lib/allowed-emails";

/**
 * Google sign-in (Auth.js). Sessions are signed, encrypted JWT cookies, so no
 * database tables are needed. Only verified Google accounts listed in
 * ALLOWED_EMAILS can sign in; the middleware re-checks the list on every
 * request, so removing an address locks that account out at once.
 *
 * Env: AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, ALLOWED_EMAILS, and
 * AUTH_TRUST_HOST=true when hosted behind a proxy (e.g. Amplify).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    signIn({ account, profile }) {
      return (
        account?.provider === "google" &&
        profile?.email_verified === true &&
        isAllowedEmail(profile.email)
      );
    },
  },
});
