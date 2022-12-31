import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useState } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";

export function useMatchSorterFilter<T, K extends keyof T>(
  completeList: T[],
  keys: K[],
  delay = undefined
) {
  const [filter, setFilter] = useState("");
  const [filteredList, setFilteredList] = useState<T[]>([]);

  const setFilterWithDelay = _.debounce((x) => setFilter(x), delay);

  useDeepCompareEffect(() => {
    if (filter) {
      setFilteredList(matchSorter(completeList, filter, { keys: keys as [] }));
    } else {
      setFilteredList(completeList);
    }
  }, [filter, completeList]);

  if (delay) {
    return [filteredList, setFilterWithDelay];
  }
  return [filteredList, setFilter];
}
