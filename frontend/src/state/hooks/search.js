import {
  screenToFlowPosition,
  setCenter,
} from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import { useEffect, useState } from "react";
import { updateSearch } from "state/actions/search/projectSearch";
import { getParamIds } from "state/actions/sections/sectionContents";
import {
  useProjectSearch,
  useSectionInfos,
  useSettings,
} from "state/definitions";

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
  return useSectionInfos((x) => {
    const output = [];
    const visitedSections = new Set();
    for (const sectionId of Object.keys(x.x)) {
      getParamsAndAddToSearchResults(
        visitedSections,
        sectionId,
        x.codeInfo,
        output,
      );
      const sectionChildren = x.variants[x.x[sectionId].variantId].children;
      for (const id of sectionChildren) {
        getParamsAndAddToSearchResults(visitedSections, id, x.codeInfo, output);
      }
    }
    return output;
  }, _.isEqual);
}

function getParamsAndAddToSearchResults(
  visitedSections,
  sectionId,
  codeInfoState,
  output,
) {
  if (!visitedSections.has(sectionId)) {
    const { ids: paramIds } = getParamIds(sectionId, codeInfoState);
    for (const p of paramIds) {
      output.push({
        sectionId,
        paramInfoId: p,
        name: codeInfoState[p].name,
      });
    }
    visitedSections.add(sectionId);
  }
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
