import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useCallback, useState } from "react";

export function useMatchSorterFilter<T, K extends keyof T>(
  completeList: T[],
  keys: K[],
  delay = undefined,
) {
  const [filter, setFilter] = useState("");
  const setFilterWithDelay = useCallback(
    _.debounce((x) => setFilter(x), delay),
    [],
  );

  const filteredList = filter
    ? matchSorter(completeList, filter, { keys: keys as [] })
    : completeList;

  if (delay) {
    return [filteredList, setFilterWithDelay];
  }
  return [filteredList, setFilter];
}
