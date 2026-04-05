import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useCallback, useEffect, useMemo, useState } from "react";
import { res200 } from "utils/endpointUtils";
import { route_check_if_file_exists } from "utils/generatedEndpoints";
import { asyncDebounce } from "utils/utils";

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

function useFileExists(delay) {
  const [fileExists, setFileExists] = useState(false);

  const debouncedCheckIfFileExists = useCallback(
    asyncDebounce(async (f) => {
      const res = await route_check_if_file_exists(f);
      if (res200(res)) {
        setFileExists(res.data);
      }
    }, delay),
    [setFileExists],
  );

  return { fileExists, debouncedCheckIfFileExists };
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
) {
  const [pendingValue, setPendingValue] = useState<T | null>(null);

  useEffect(() => {
    if (!pendingValue || pendingValue === globalValue) {
      setPendingValue(null);
      return;
    }
    callbackOnGlobalUpdate?.(pendingValue);
  }, [globalValue]);

  return [pendingValue ?? globalValue, setPendingValue] as const;
}
