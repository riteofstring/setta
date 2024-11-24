import {
  screenToFlowPosition,
  setCenter,
} from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import { useEffect, useState } from "react";
import { updateSearch } from "state/actions/search/projectSearch";
import { getParamIds } from "state/actions/sections/sectionContents";
import { useCodeInfo, useProjectSearch, useSettings } from "state/definitions";
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
      if (searchResults.length === 0) {
        return;
      }
      const newIdx = (currIdx + 1) % searchResults.length;
      const focusedSearchResult = searchResults[newIdx];
      useProjectSearch.setState({ focused: focusedSearchResult });
      goToSearchResult(focusedSearchResult);
      setCurrIdx(newIdx);
    } else if (e.key === "Escape") {
      e.target.blur();
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

  return useCodeInfo((x) => {
    const output = [];
    for (const id of allIds) {
      const { ids: paramIds } = getParamIds(id, x.x);
      for (const p of paramIds) {
        output.push({
          sectionId: id,
          paramInfoId: p,
          name: x.x[p].name,
        });
      }
    }
    return output;
  });
}

const doUpdateSearch = _.debounce(updateSearch, 100);

function goToSearchResult(searchResult) {
  const { sectionId, paramInfoId } = searchResult;
  const element = document.getElementById(
    `ParamContainer-${sectionId}-${paramInfoId}`,
  );
  const { x: _x, y: _y, width, height } = element.getBoundingClientRect();
  const { x, y } = screenToFlowPosition({
    x: _x + width / 2,
    y: _y + height / 2,
  });
  const zoom = useSettings.getState().defaultZoomLevel;
  setCenter(x, y, { zoom });
}
