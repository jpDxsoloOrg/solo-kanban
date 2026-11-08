/**
 * Lets components pause live refreshes while local, not-yet-saved state is on
 * screen (e.g. an optimistic card move). A refresh that arrives meanwhile
 * would render server data from before the save and make the UI jump back.
 */

let holds = 0;
const releaseListeners = new Set<() => void>();

/**
 * Defers live refreshes until the returned function is called. Call it
 * synchronously when the optimistic update starts and release it in a
 * `finally`. Releasing twice is a no-op.
 */
export function holdLiveRefresh(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds === 0) releaseListeners.forEach((listener) => listener());
  };
}

export function isLiveRefreshHeld(): boolean {
  return holds > 0;
}

/** Called whenever the last hold is released. */
export function onLiveRefreshHoldsReleased(listener: () => void): () => void {
  releaseListeners.add(listener);
  return () => {
    releaseListeners.delete(listener);
  };
}
