import _ from "lodash";
import { useCallback, useState } from "react";
import { updateSearch } from "state/actions/search/projectSearch";

export function useUpdateProjectSearch() {
  const [value, setValue] = useState("");

  function onChange(v) {
    setValue(v);
    doUpdateSearch(v);
  }

  const doUpdateSearch = useCallback(_.debounce(updateSearch, 100), []);
  return [value, onChange];
}
