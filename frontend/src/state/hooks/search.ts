import {
  screenToFlowPosition,
  setCenter,
} from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useState } from "react";
import {
  getDisplayedSectionIdToChildren,
  getParamDisplayName,
  getTopLevelSectionIdsForDisplay,
} from "state/actions/sectionInfos";
import { getAllVisibleParamsInSection } from "state/actions/sections/sectionContents";
import { useProjectState, ZustandProjectState } from "state/definitions";
import {
  useProjectSearch,
  type ZustandProjectSearch,
} from "state/stores/searchStores";
import { useSettings } from "state/stores/uiPreferenceStores";
import { clamp } from "utils/utils";

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
  const topLevelSectionIds = getTopLevelSectionIdsForDisplay(state);

  function dfs(sectionId: string) {
    if (sectionId) {
      getParamsAndAddToSearchResults(state, sectionId, output);
    }

    const children = sectionIdToChildren[sectionId] || [];
    for (const childId of children) {
      dfs(childId);
    }
  }

  for (const t of topLevelSectionIds) {
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
      name: getParamDisplayName(state, sectionId, p),
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
  const shouldDelay = scrollParamIntoView(element);
  const centerOnElement = () => {
    const { x: _x, y: _y, width, height } = element.getBoundingClientRect();
    const { x, y } = screenToFlowPosition({
      x: _x + width / 2,
      y: _y + height / 2,
    });
    const zoom = useSettings.getState().gui.defaultZoomLevel;
    setCenter(x, y, { zoom });
  };

  if (shouldDelay) {
    requestAnimationFrame(centerOnElement);
  } else {
    centerOnElement();
  }
}

function scrollParamIntoView(element: HTMLElement): boolean {
  const scrollParent = findScrollableAncestor(element);
  if (!scrollParent) {
    return false;
  }

  const parentRect = scrollParent.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const maxScrollTop = scrollParent.scrollHeight - scrollParent.clientHeight;
  const maxScrollLeft = scrollParent.scrollWidth - scrollParent.clientWidth;
  let nextScrollTop = scrollParent.scrollTop;
  let nextScrollLeft = scrollParent.scrollLeft;

  if (maxScrollTop > 0) {
    const targetRatio = 0.3;
    const elementOffsetTop =
      elementRect.top - parentRect.top + scrollParent.scrollTop;
    const desiredScrollTop =
      elementOffsetTop +
      elementRect.height / 2 -
      scrollParent.clientHeight * targetRatio;
    nextScrollTop = clamp(desiredScrollTop, 0, maxScrollTop);
  }

  if (maxScrollLeft > 0) {
    const elementOffsetLeft =
      elementRect.left - parentRect.left + scrollParent.scrollLeft;
    const elementRight = elementOffsetLeft + elementRect.width;
    const viewLeft = scrollParent.scrollLeft;
    const viewRight = scrollParent.scrollLeft + scrollParent.clientWidth;

    if (elementOffsetLeft < viewLeft) {
      nextScrollLeft = elementOffsetLeft;
    } else if (elementRight > viewRight) {
      nextScrollLeft = elementRight - scrollParent.clientWidth;
    }

    nextScrollLeft = clamp(nextScrollLeft, 0, maxScrollLeft);
  }

  const shouldScroll =
    nextScrollTop !== scrollParent.scrollTop ||
    nextScrollLeft !== scrollParent.scrollLeft;

  if (shouldScroll) {
    scrollParent.scrollTop = nextScrollTop;
    scrollParent.scrollLeft = nextScrollLeft;
  }

  return shouldScroll;
}

function findScrollableAncestor(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement;
  while (current && current !== document.body) {
    if (isScrollableElement(current)) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

function isScrollableElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  const overflowX = style.overflowX;
  const scrollableY =
    (overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay") &&
    element.scrollHeight > element.clientHeight;
  const scrollableX =
    (overflowX === "auto" ||
      overflowX === "scroll" ||
      overflowX === "overlay") &&
    element.scrollWidth > element.clientWidth;

  return scrollableY || scrollableX;
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
