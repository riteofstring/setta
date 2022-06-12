import { matchSorter } from "match-sorter";
import { useState } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";

export function useMatchSorterFilter(completeList, matchSorterProps) {
  const [filter, setFilter] = useState("");
  const [filteredList, setFilteredList] = useState([]);

  useDeepCompareEffect(() => {
    setFilteredList(matchSorter(completeList, filter, matchSorterProps));
  }, [filter, completeList]);

  return [filteredList, setFilter];
}
