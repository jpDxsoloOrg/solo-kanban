import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * API key auth for the public API.
 *
 * Keys come from the `API_KEYS` environment variable (comma-separated, so a
 * key can be rotated by adding the new one before removing the old one).
 * With no keys configured the API is disabled and answers 503.
 *
 * Clients send the key as `Authorization: Bearer <key>` or `X-API-Key: <key>`.
 */

/** Shorter keys are ignored: they're too easy to guess. */
export const MIN_API_KEY_LENGTH = 32;

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function configuredKeys(): Buffer[] {
  return (process.env.API_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length >= MIN_API_KEY_LENGTH)
    .map(digest);
}

function presentedKey(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match ? match[1].trim() : null;
  }
  return req.headers.get("x-api-key")?.trim() || null;
}

export type AuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; code: string; message: string };

export function authenticate(req: NextRequest): AuthResult {
  const keys = configuredKeys();
  if (keys.length === 0) {
    return {
      ok: false,
      status: 503,
      code: "api_disabled",
      message: `The API is disabled: set API_KEYS (keys of at least ${MIN_API_KEY_LENGTH} characters) on the server.`,
    };
  }

  const key = presentedKey(req);
  if (!key) {
    return {
      ok: false,
      status: 401,
      code: "unauthorized",
      message: "Missing API key. Send it as 'Authorization: Bearer <key>' or 'X-API-Key: <key>'.",
    };
  }

  // Compare fixed-length digests in constant time, checking every key.
  const presented = digest(key);
  let match = false;
  for (const candidate of keys) {
    if (timingSafeEqual(presented, candidate)) match = true;
  }
  return match ? { ok: true } : { ok: false, status: 401, code: "unauthorized", message: "Invalid API key." };
}
