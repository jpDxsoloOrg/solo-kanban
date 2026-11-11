"use server";

import { signIn, signOut } from "@/auth";

/** Only same-site paths, so the sign-in flow can't bounce to another site. */
function safeCallback(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }
  return value;
}

export async function signInWithGoogle(formData: FormData) {
  await signIn("google", { redirectTo: safeCallback(formData.get("callbackUrl")) });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
