import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useMatchSorterFilter<T>(
  completeList: Array<T>,
  keys: Array<string>,
) {
  const [filter, setFilter] = useState("");
  const filteredList = filter
    ? matchSorter(completeList, filter, { keys })
    : completeList;
  return [filteredList, setFilter] as const;
}
export function useMatchSorterFilterWithDelay<T>(
  completeList: Array<T>,
  keys: Array<string>,
  delay: number,
) {
  const [filteredList, setFilter] = useMatchSorterFilter(completeList, keys);
  const setFilterWithDelay = useMemo(
    () => _.debounce((x) => setFilter(x), delay),
    [delay],
  );
  return [filteredList, setFilterWithDelay] as const;
}
export function useWindowSize() {
  // Initialize state with undefined width/height so server and client renders match
  // Learn more here: https://joshwcomeau.com/react/the-perils-of-rehydration/
  const [windowSize, setWindowSize] = useState<{
    winWidth: number | undefined;
    winHeight: number | undefined;
  }>({
    winWidth: undefined,
    winHeight: undefined,
  });
  useEffect(() => {
    // Handler to call on window resize
    function handleResize() {
      // Set window width/height to state
      setWindowSize({
        winWidth: window.innerWidth,
        winHeight: window.innerHeight,
      });
    }
    // Add event listener
    window.addEventListener("resize", handleResize);
    // Call handler right away so state gets updated with initial window size
    handleResize();
    // Remove event listener on cleanup
    return () => window.removeEventListener("resize", handleResize);
  }, []); // Empty array ensures that effect is only run on mount
  return windowSize;
}
export function useLocalValue<T>(globalValue: T) {
  const [localValue, setLocalValue] = useState<T>(globalValue);
  useEffect(() => {
    setLocalValue(globalValue);
  }, [globalValue]);
  return [localValue, setLocalValue] as const;
}
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
  const setPendingValue = useCallback(
    (value: T) => {
      setPendingState({
        ownerKey,
        value,
      });
    },
    [ownerKey],
  );
  return [pendingValue ?? globalValue, setPendingValue] as const;
}
