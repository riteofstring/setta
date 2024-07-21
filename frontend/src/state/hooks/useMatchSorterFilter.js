import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useCallback, useState } from "react";

export function useMatchSorterFilter(completeList, keys, delay) {
  const [filter, setFilter] = useState("");
  const setFilterWithDelay = useCallback(
    _.debounce((x) => setFilter(x), delay),
    [],
  );

  const filteredList = filter
    ? matchSorter(completeList, filter, { keys })
    : completeList;

  if (delay) {
    return [filteredList, setFilterWithDelay];
  }
  return [filteredList, setFilter];
}
