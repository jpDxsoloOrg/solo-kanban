"use client";

import { useSyncExternalStore } from "react";

/**
 * public/sw.js adds this to pages it serves from its cache because the
 * network failed; its content is when the copy was saved ("" if unknown).
 */
const SAVED_COPY_SELECTOR = 'meta[name="sk-saved-copy"]';

/**
 * When this document is a saved copy: its save time, else null. Read before
 * hydration, and fixed for the life of the document (client-side
 * navigations keep it).
 */
export const savedCopyAt: string | null =
  typeof document === "undefined"
    ? null
    : (document.querySelector<HTMLMetaElement>(SAVED_COPY_SELECTOR)?.content ?? null);

const subscribeNever = () => () => {};

/**
 * The save time when this page is a saved copy served offline, else null.
 * Server render and hydration report null.
 */
export function useSavedCopyAt(): string | null {
  return useSyncExternalStore(
    subscribeNever,
    () => savedCopyAt,
    () => null,
  );
}
