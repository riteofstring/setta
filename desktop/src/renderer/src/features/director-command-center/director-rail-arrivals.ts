import { useLayoutEffect, useRef } from "react";

/**
 * Names only keys added after this rail's first committed render.
 *
 * Initial content should already be present when the command center appears;
 * motion is reserved for an arrival that changes the user's current picture.
 */
export function useDirectorRailArrivalKeys(keys: readonly string[]): ReadonlySet<string> {
  const committedKeys = useRef<ReadonlySet<string> | null>(null);
  const arrivals = new Set<string>();
  if (committedKeys.current !== null) {
    for (const key of keys) {
      if (!committedKeys.current.has(key)) {
        arrivals.add(key);
      }
    }
  }
  useLayoutEffect(() => {
    committedKeys.current = new Set(keys);
  }, [keys]);
  return arrivals;
}
