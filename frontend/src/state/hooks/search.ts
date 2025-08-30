import {
  screenToFlowPosition,
  setCenter,
} from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useState } from "react";
import {
  getCodeObjCore,
  getDisplayedSectionIdToChildren,
} from "state/actions/sectionInfos";
import { getAllVisibleParamsInSection } from "state/actions/sections/sectionContents";
import {
  useProjectSearch,
  useProjectState,
  useSettings,
  ZustandProjectSearch,
  ZustandProjectState,
} from "state/definitions";

export function useUpdateProjectSearch() {
  const [value, setValue] = useState("");
  const [visibleParams, setVisibleParams] = useState<
    ZustandProjectSearch["codeInfo"]
  >([]);
  const [currIdx, setCurrIdx] = useState(-1);
  const numResults = useProjectSearch((x) => x.codeInfo.length);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setValue(v);
    doUpdateSearch(v, visibleParams);
    setCurrIdx(-1);
  }

  function onBlur() {
    useProjectSearch.getState().reset();
  }

  function onFocus() {
    const newVisibleParams = getAllVisibleParams();
    setVisibleParams(newVisibleParams);
    doUpdateSearch(value, newVisibleParams);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.code === "Enter") {
      const { codeInfo: searchResults } = useProjectSearch.getState();
      if (searchResults.length === 0) {
        return;
      }
      const newIdx = (currIdx + 1) % searchResults.length;
      const focusedSearchResult = searchResults[newIdx];
      if (!focusedSearchResult) {
        return;
      }
      useProjectSearch.setState({ focused: focusedSearchResult });
      goToSearchResult(focusedSearchResult);
      setCurrIdx(newIdx);
    } else if (e.code === "Escape") {
      e.currentTarget.blur();
    }
  }

  return {
    value,
    onChange,
    onBlur,
    onFocus,
    onKeyDown,
    currIdx,
    numResults,
  };
}

function getAllVisibleParams() {
  const state = useProjectState.getState();
  const output: ZustandProjectSearch["codeInfo"] = [];
  const sectionIdToChildren = getDisplayedSectionIdToChildren(state);

  function dfs(sectionId: string) {
    if (sectionId) {
      getParamsAndAddToSearchResults(state, sectionId, output);
    }

    const children = sectionIdToChildren[sectionId] || [];
    for (const childId of children) {
      dfs(childId);
    }
  }

  for (const t of Object.keys(state.projectConfig.topLevelSections)) {
    dfs(t);
  }

  return output;
}

function getParamsAndAddToSearchResults(
  state: ZustandProjectState,
  sectionId: string,
  output: ZustandProjectSearch["codeInfo"],
) {
  const ids = getAllVisibleParamsInSection(state, sectionId);
  for (const p of ids) {
    output.push({
      sectionId,
      paramInfoId: p,
      name: getCodeObjCore(state, p).name,
    });
  }
}

function goToSearchResult(
  searchResult: NonNullable<ZustandProjectSearch["focused"]>,
) {
  const { sectionId, paramInfoId } = searchResult;
  const element = document.getElementById(
    `ParamContainer-${sectionId}-${paramInfoId}`,
  );
  if (!element) {
    console.error("goToSearchResult element not found");
    return;
  }
  const { x: _x, y: _y, width, height } = element.getBoundingClientRect();
  const { x, y } = screenToFlowPosition({
    x: _x + width / 2,
    y: _y + height / 2,
  });
  const zoom = useSettings.getState().gui.defaultZoomLevel;
  setCenter(x, y, { zoom });
}

function updateSearch(
  value: string,
  allVisibleParams: ZustandProjectSearch["codeInfo"],
) {
  if (!value) {
    useProjectSearch.getState().reset();
    return;
  }

  // TODO: should we sort or not?
  const codeInfo = matchSorter(allVisibleParams, value, {
    keys: ["name"],
    sorter: (rankedItems) => rankedItems,
  });

  useProjectSearch.setState({
    codeInfo,
    lookup: new Set(
      codeInfo.map((x) =>
        createProjectSearchLookupKey(x.sectionId, x.paramInfoId),
      ),
    ),
  });
}

const doUpdateSearch = _.debounce(updateSearch, 100);

export function createProjectSearchLookupKey(
  sectionId: string,
  paramInfoId: string,
) {
  return `${sectionId}-${paramInfoId}`;
}
