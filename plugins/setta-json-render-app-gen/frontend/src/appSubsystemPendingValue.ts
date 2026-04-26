import _ from "lodash";
import { useEffect, useRef, useState } from "react";

/**
 * Keep this plugin-local so the provider does not import the host
 * `state/hooks/utils` module at runtime.
 */
export function useLocalPendingValue<T>(
  globalValue: T,
  callbackOnGlobalUpdate?: (x: T) => void,
  ownerKey?: unknown,
) {
  const [pendingState, setPendingState] = useState<{
    ownerKey: unknown;
    value: T;
  } | null>(null);
  const callbackRef = useRef(callbackOnGlobalUpdate);
  const pendingStateRef = useRef(pendingState);

  useEffect(() => {
    callbackRef.current = callbackOnGlobalUpdate;
  }, [callbackOnGlobalUpdate]);

  useEffect(() => {
    pendingStateRef.current = pendingState;
  }, [pendingState]);

  const pendingValue =
    pendingState && Object.is(pendingState.ownerKey, ownerKey)
      ? pendingState.value
      : null;

  useEffect(() => {
    const currentPendingState = pendingStateRef.current;
    const currentPendingValue =
      currentPendingState && Object.is(currentPendingState.ownerKey, ownerKey)
        ? currentPendingState.value
        : null;
    if (currentPendingValue === null) {
      return;
    }
    if (_.isEqual(currentPendingValue, globalValue)) {
      setPendingState(null);
      return;
    }
    callbackRef.current?.(currentPendingValue);
  }, [globalValue, ownerKey]);

  useEffect(() => {
    if (pendingValue === null) {
      return;
    }
    if (_.isEqual(pendingValue, globalValue)) {
      setPendingState(null);
    }
  }, [globalValue, pendingValue]);

  return [
    pendingValue ?? globalValue,
    (value: T) => {
      setPendingState({
        ownerKey,
        value,
      });
    },
  ] as const;
}
