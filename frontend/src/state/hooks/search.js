import _ from "lodash";
import { useEffect, useState } from "react";
import { updateSearch } from "state/actions/search/projectSearch";
import { goToSection } from "state/actions/sections/sectionPositions";
import {
  useCodeInfo,
  useProjectSearch,
  useSectionToParams,
} from "state/definitions";
import { findAllParameters } from "utils/getDescendants";
import { useSectionIdToChildren } from "./sectionVariants";

export function useUpdateProjectSearch() {
  const [value, setValue] = useState("");
  const allVisibleParams = useAllVisibleParams();

  function onChange(v) {
    setValue(v);
    doUpdateSearch(v, allVisibleParams);
  }

  function onBlur() {
    useProjectSearch.getState().reset();
  }

  function onFocus() {
    doUpdateSearch(value, allVisibleParams);
  }

  useEffect(() => {
    doUpdateSearch(value, allVisibleParams);
  }, [allVisibleParams.length]);

  return { value, onChange, onBlur, onFocus };
}

export function useOnEnterGoToSearchResult() {
  const searchResults = useProjectSearch((x) => x.codeInfo);
  const [currIdx, setCurrIdx] = useState(-1);
  function onKeyDown(e) {
    if (e.key === "Enter") {
      const newIdx = (currIdx + 1) % searchResults.length;
      const focusedSearchResult = searchResults[newIdx];
      useProjectSearch.setState({ focused: focusedSearchResult });
      goToSection(focusedSearchResult.sectionId);
      setCurrIdx(newIdx);
    } else {
      useProjectSearch.setState({ focused: {} });
      setCurrIdx(-1);
    }
  }

  useEffect(() => {
    if (currIdx > -1) {
      setCurrIdx((x) => x % searchResults.length);
    }
  }, [searchResults.length]);

  return onKeyDown;
}

function useAllVisibleParams() {
  const sectionIdToChildren = useSectionIdToChildren();
  const allIds = [];
  const allIdsSet = new Set();

  // Add all keys (IDs) to the set
  Object.entries(sectionIdToChildren).forEach(([key, value]) => {
    if (!allIdsSet.has(key)) {
      allIdsSet.add(key);
      allIds.push(key);
    }
    value.forEach((id) => {
      if (!allIdsSet.has(id)) {
        allIdsSet.add(id);
        allIds.push(id);
      }
    });
  });

  return useSectionToParams((x) => {
    const output = [];
    const cState = useCodeInfo.getState().x;
    for (const id of allIds) {
      const topLevelParams = x.params[id];
      if (!topLevelParams) {
        continue;
      }
      for (const topLevelParam of topLevelParams) {
        for (const param of findAllParameters(cState, [topLevelParam.id])) {
          output.push({
            sectionId: id,
            paramInfoId: param.id,
            name: param.name,
          });
        }
      }
    }
    return output;
  });
}

const doUpdateSearch = _.debounce(updateSearch, 100);
