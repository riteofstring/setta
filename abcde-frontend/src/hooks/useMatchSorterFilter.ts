import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useState } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";

export function useMatchSorterFilter(completeList, keys, delay = undefined) {
  const [filter, setFilter] = useState("");
  const [filteredList, setFilteredList] = useState([]);

  const setFilterWithDelay = _.debounce((x) => setFilter(x), delay);

  useDeepCompareEffect(() => {
    if (filter) {
      setFilteredList(matchSorter(completeList, filter, { keys }));
    } else {
      setFilteredList(completeList);
    }
  }, [filter, completeList]);

  if (delay) {
    return [filteredList, setFilterWithDelay];
  }
  return [filteredList, setFilter];
}
