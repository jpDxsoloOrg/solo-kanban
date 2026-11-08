"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

/**
 * Local, editable copy of data that comes from the server as props.
 *
 * Components that apply their own changes optimistically keep server data in
 * state, which used to mean refreshed props (live updates, revalidation) were
 * ignored. This state follows the props instead: whenever a refresh delivers
 * a new value it replaces the local copy. Nothing remounts, so the rest of
 * the component's state (inputs, open menus, drafts) is untouched.
 *
 * - `paused`: while true (e.g. an optimistic update is saving), new props
 *   wait and are adopted once it turns false.
 * - `skipPendingProps()`: after a successful save, ignore props that arrived
 *   while it was saving. They may predate it, and adopting them would undo
 *   the optimistic change until the next refresh.
 */
export function useServerState<T>(
  serverValue: T,
  paused = false
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [value, setValue] = useState(serverValue);
  const [synced, setSynced] = useState(serverValue);
  const latestServerValue = useRef(serverValue);

  useEffect(() => {
    latestServerValue.current = serverValue;
  }, [serverValue]);

  // Adjusting state while rendering (instead of in an effect) avoids a frame
  // that shows the old value.
  if (!paused && serverValue !== synced) {
    setSynced(serverValue);
    setValue(serverValue);
  }

  const skipPendingProps = useCallback(() => {
    setSynced(latestServerValue.current);
  }, []);

  return [value, setValue, skipPendingProps];
}
