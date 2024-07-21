import C from "constants/constants.json";
import { useDndChildren } from "forks/dnd-kit/dndChildren";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { openWebSocket, sendLocation } from "requests/websocket";
import { isAmongNonPresets } from "state/actions/cloneUITypes";
import { idForLSPWaiting } from "state/actions/lsp";
import { deleteSectionRef, setSectionRef } from "state/actions/sectionRefs";
import {
  useCodeInfo,
  useEVCols,
  useNodeInternals,
  useOutputGroups,
  useOutputs,
  useParamSweep,
  useSectionInfos,
  useSectionToParams,
  useUITypeCols,
  useUITypes,
  useWaitingForLSPResult,
} from "state/definitions";
import {
  getMappedSectionDBSource,
  getSectionDBSource,
} from "state/getters/sectionInfo";
import { getDepthListing } from "utils/childrenToDepth";
import { assembleCollectionsForSectionConfig } from "utils/codeInfoUtils";
import {
  DB_SOURCES_TAB,
  INFO_CONFIG_TAB,
  SECTIONWIDTH,
  SECTION_CONFIG_TAB,
  UI_CONFIG_TAB,
} from "utils/constants";
import {
  isBasePreset,
  isPreset,
  isRoot,
  isSectionUIType,
  isSeriesElement,
  isUserPreset,
  PresetType,
  requiresKeyInput,
  uiTypesToPretty,
} from "utils/sectionTypeHelpers";

export function useSectionRefAndInit(sectionId, type) {
  const ref = useRef(null);

  useEffect(() => {
    setSectionRef({ sectionId, [type]: ref.current });
    return () => deleteSectionRef({ sectionId });
  }, []);

  return ref;
}

export function useHasNested(sectionId) {
  return useSectionInfos((x) => x.x[sectionId].children?.length > 0);
}

export function useTempHasNested(sectionId) {
  return useDndChildren((x) => x.x[sectionId]?.length > 0);
}

export function useGetSectionInfo(sectionId, key) {
  const equalityFn = [
    "children",
    "size",
    "evColIds",
    "nonPresetUITypeIds",
  ].includes(key)
    ? _.isEqual
    : undefined;
  return useSectionInfos((x) => x.x[sectionId][key], equalityFn);
}

export function useSectionInfoNames() {
  return useSectionInfos((x) => _.mapValues(x.x, (y) => y.name), _.isEqual);
}

export function useSectionHasMultipleEVCols(sectionId) {
  return useSectionInfos((x) => x.x[sectionId].evColIds.length > 1);
}

export function useSectionDBSource(sectionId) {
  return useSectionInfos((x) => getSectionDBSource(sectionId, x));
}

export function useMappedSectionDBSource(sectionId) {
  return useSectionInfos((x) => getMappedSectionDBSource(sectionId, x));
}

export function useSectionDBSourceIsAvailable(sectionId) {
  const dbSource = useMappedSectionDBSource(sectionId);
  return useEVCols((x) => dbSource in x.x);
}

export function useGetParamUIType(sectionId, paramInfoId) {
  const uiTypeId = useParamUITypeId(sectionId, paramInfoId);
  return useUITypes((x) => x.x[uiTypeId], _.isEqual);
}

function useUITypeCol(sectionId, paramInfoId, key) {
  const uiTypeColId = useGetSectionInfo(sectionId, "uiTypeColId");
  return useUITypeCols((x) => x.y[uiTypeColId][paramInfoId][key]);
}

function useParamUITypeId(sectionId, paramInfoId) {
  return useUITypeCol(sectionId, paramInfoId, "uiTypeId");
}

export function useParamNonPresetUITypeIds(sectionId, paramInfoId) {
  return useUITypeCol(sectionId, paramInfoId, "nonPresetUITypeIds");
}

function createName(uiType) {
  const x = uiTypesToPretty.get(uiType.type);
  if (isUserPreset(uiType)) {
    return `${uiType.name} - (${x})`;
  }
  return x;
}

function filterUITypes(
  uiTypes,
  generalFilterFn,
  nonPresetFilterFn,
  selectedId,
) {
  const output = [];

  const nonPresets = _.filter(uiTypes, nonPresetFilterFn);

  for (const u of Object.values(uiTypes)) {
    // skip if it doesn't pass the general filter or it's not a preset
    if (!generalFilterFn(u) || !isPreset(u)) {
      continue;
    }

    // replace base presets with non-presets of the same type
    if (isBasePreset(u)) {
      // add base no matter what, if it's selected
      if (u.id === selectedId) {
        output.push(u);
      } else {
        // otherwise, maybe replace it with a non-preset
        const match = nonPresets.find((v) => v.type === u.type);
        output.push(match ?? u);
      }
    } else {
      output.push(u);
    }
  }

  return output.map((v) => ({
    id: v.id,
    name: createName(v),
    presetType: v.presetType,
    displayType: v.presetType ?? PresetType.BASE, // display non-preset types as "base" types
  }));
}

export function useAvailableUITypesForSection(sectionId, selectedId) {
  const nonPresetUITypeIds = useGetSectionInfo(sectionId, "nonPresetUITypeIds");
  const currTypeName = useGetSectionType(sectionId, "type");
  const generalFilterFn = getSectionFilterFn(currTypeName);
  const nonPresetFilterFn = (uiType) =>
    isAmongNonPresets(uiType, nonPresetUITypeIds);

  return useUITypes(
    (x) => filterUITypes(x.x, generalFilterFn, nonPresetFilterFn, selectedId),
    _.isEqual,
  );
}

export function useAvailableUITypesForParam(
  sectionId,
  paramInfoId,
  selectedId,
) {
  const nonPresetUITypeIds = useParamNonPresetUITypeIds(sectionId, paramInfoId);

  const generalFilterFn = (x) => !isSectionUIType(x);
  const nonPresetFilterFn = (uiType) =>
    isAmongNonPresets(uiType, nonPresetUITypeIds);

  return useUITypes(
    (x) => filterUITypes(x.x, generalFilterFn, nonPresetFilterFn, selectedId),
    _.isEqual,
  );
}

function getOtherSectionTypeNamesToShow(currTypeName) {
  switch (currTypeName) {
    case C.SECTION:
      return [C.LIST_ROOT, C.DICT_ROOT];
    case C.LIST_ROOT:
      return [C.SECTION, C.DICT_ROOT];
    case C.DICT_ROOT:
      return [C.SECTION, C.LIST_ROOT];
    default:
      return [];
  }
}

function getSectionFilterFn(currTypeName) {
  return (uiType) =>
    uiType.type === currTypeName ||
    getOtherSectionTypeNamesToShow(currTypeName).includes(uiType.type);
}

export function useAllOutputNames() {
  const outputNames = useOutputs(
    (x) => _.mapValues(x.x, (output) => output.name),
    _.isEqual,
  );

  const groups = useOutputGroups(
    (x) =>
      _.mapValues(x.x, (group) => ({
        id: group.id,
        name: group.name,
        children: _.map(group.children, (c) => outputNames[c]),
      })),
    _.isEqual,
  );

  return groups;
}

export function useOutputValues(groupId) {
  const group = useOutputGroups((x) => x.x[groupId], _.isEqual);
  const children = groupId ? group.children : [];
  const childrenOutputs = useOutputs(
    (x) =>
      _.keyBy(
        children.map((c) => x.x[c]),
        "id",
      ),
    _.isEqual,
  );

  if (!groupId) {
    return null;
  }

  return { ...group, children: children.map((c) => childrenOutputs[c]) };
}

export function useGetAllCallables(sectionId) {
  return useSectionToParams((x) => x.callables[sectionId] ?? [], _.isEqual);
}

export function useGetParamInfos(sectionId) {
  return useSectionToParams((x) => x.params[sectionId] ?? [], _.isEqual);
}

export function useGetParamInfosThatHaveNames(sectionId) {
  return useSectionToParams(
    (x) => x.params[sectionId]?.filter((x) => x.name) ?? [],
    _.isEqual,
  );
}

function useGetSelectedCollections(sectionId) {
  const codeInfoId = useGetSectionTypeConfig(sectionId, "codeInfoId");
  return useCodeInfo((x) => _.pick(x.x, x.x[codeInfoId].children), _.isEqual);
}

export function useGetSelectedCollectionsForSectionConfig(sectionId) {
  const collections = useGetSelectedCollections(sectionId);
  return useCodeInfo(
    (x) => assembleCollectionsForSectionConfig(x.x, collections),
    _.isEqual,
  );
}

export function useGetSelectedOutputValues(sectionId) {
  const groupId = useGetSectionInfo(sectionId, "outputGroup");
  return useOutputValues(groupId);
}

export function useParamSweepInfo(sectionId) {
  const forSectionId = useForSectionId(sectionId);
  const paramSweepId = useSectionInfos((x) =>
    forSectionId ? x.x[forSectionId].paramSweepId : null,
  );
  const previewParamSweepId = useSectionInfos((x) =>
    forSectionId ? x.x[forSectionId].previewParamSweepId : null,
  );
  const paramSweep = useParamSweep(
    (x) => x.x[previewParamSweepId ?? paramSweepId].sweep,
  );
  const codeInfoId = useGetSectionTypeConfig(forSectionId, "codeInfoId");
  const selectedItem = useGetSectionInfo(forSectionId, "selectedItem");
  return {
    paramSweepId,
    paramSweep,
    forSectionId,
    codeInfoId: selectedItem ?? codeInfoId,
  };
}

export function useSectionHasMultipleParamSweeps(sectionId) {
  const forSectionId = useForSectionId(sectionId);
  return useSectionInfos(
    (x) => forSectionId && x.x[forSectionId].paramSweepIds.length > 1,
  );
}

export function useGetParamSweepNames(sectionId) {
  const paramSweepIds = useSectionInfos((x) => x.x[sectionId].paramSweepIds);
  return useParamSweep(
    (x) => paramSweepIds.map((e) => ({ id: e, name: x.x[e].name })),
    _.isEqual,
  );
}

export function useCurrParamSweepId(sectionId) {
  const forSectionId = useForSectionId(sectionId);
  return useGetSectionInfo(forSectionId, "paramSweepId");
}

export function useForSectionId(sectionId) {
  return useSectionInfos((x) => getForSectionId(x.x, sectionId));
}

export function getForSectionId(state, sectionId) {
  return Object.values(state).find((s) => s.paramSweepSectionId === sectionId)
    ?.id;
}

export function useGetSectionTypeConfig(sectionId, key) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useUITypes((x) => x.x[uiTypeId]["config"][key]);
}

export function useGetSectionType(sectionId, key) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  const nonScalars = ["config"];
  const equalityFn = nonScalars.includes(key) ? _.isEqual : undefined;
  return useUITypes((x) => x.x[uiTypeId][key], equalityFn);
}

export function useIsSeriesElement(sectionId) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useUITypes((x) => isSeriesElement(x.x[uiTypeId]["config"].subType));
}

export function useSectionTypeName(sectionId) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useUITypes((x) => x.x[uiTypeId].type);
}

export function useSectionTypeNames() {
  const sectionIdToUITypeId = useSectionInfos(
    (x) => _.mapValues(x.x, (s) => s.uiTypeId),
    _.isEqual,
  );
  return useUITypes((x) =>
    _.mapValues(sectionIdToUITypeId, (s) => x.x[s].type),
  );
}

function useIsType(sectionId, type) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useUITypes((x) => x.x[uiTypeId].type === type);
}

export function useIsOneOfType(sectionId, types) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useUITypes((x) => types.includes(x.x[uiTypeId].type));
}

export function useIsRoot(sectionId) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useUITypes((x) => isRoot(x.x[uiTypeId].type));
}

export function useIsDeck(sectionId) {
  return useIsType(sectionId, C.DECK);
}

export function useIsOutput(sectionId) {
  return useIsType(sectionId, C.OUTPUT);
}

// export function useIsInfo(sectionId: string) {
//   return useIsType(sectionId, INFO);
// }

export function useIsSocial(sectionId) {
  return useIsType(sectionId, C.SOCIAL);
}

export function useIsGlobalVariables(sectionId) {
  return useIsType(sectionId, C.GLOBAL_VARIABLES);
}

// export function useIsCode(sectionId: string) {
//   return useIsType(sectionId, CODE);
// }

// export function useIsVarControl(sectionId: string) {
//   return useIsType(sectionId, VAR_CONTROL);
// }

export function useIsTerminal(sectionId) {
  return useIsType(sectionId, C.TERMINAL);
}

export function useMinSectionHeight(sectionId) {
  const isOutput = useIsOutput(sectionId);
  const isRoot = useIsRoot(sectionId);
  const hasTitle = true;
  const hasSearch = useGetAllCallables(sectionId).length > 0 && !isRoot;
  const hasKwargControl = !isRoot;

  if (isRoot) {
    return 50;
  }

  if (isOutput) {
    return 300;
  }

  return (
    (hasTitle ? 56 : 0) + (hasSearch ? 48 : 0) + 52 + (hasKwargControl ? 34 : 0)
    // (hasInfo ? 64 : 0)
  );
}

export function useMinSectionWidth(sectionId) {
  const isTwitter = useIsTwitter(sectionId);

  if (isTwitter) {
    // 250 is min width of a tweet. Add 150 for margin
    // https://developer.twitter.com/en/docs/twitter-for-websites/embedded-tweets/guides/embedded-tweet-parameter-reference
    return 400;
  }

  return SECTIONWIDTH;
}

export function useMaxSectionWidth(sectionId) {
  const isTwitter = useIsTwitter(sectionId);
  if (isTwitter) {
    // 550 is max width of a tweet. Add 100 for margin
    // https://developer.twitter.com/en/docs/twitter-for-websites/embedded-tweets/guides/embedded-tweet-parameter-reference
    return 650;
  }
  return undefined;
}

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

export function useWindowSize() {
  // Initialize state with undefined width/height so server and client renders match
  // Learn more here: https://joshwcomeau.com/react/the-perils-of-rehydration/
  const [windowSize, setWindowSize] = useState({
    winWidth: undefined,
    winHeight: undefined,
  });

  useEffect(() => {
    // Handler to call on window resize
    function handleResize() {
      // Set window width/height to state
      setWindowSize({
        winWidth: window.innerWidth,
        winHeight: window.innerHeight,
      });
    }

    // Add event listener
    window.addEventListener("resize", handleResize);

    // Call handler right away so state gets updated with initial window size
    handleResize();

    // Remove event listener on cleanup
    return () => window.removeEventListener("resize", handleResize);
  }, []); // Empty array ensures that effect is only run on mount

  return windowSize;
}

// youtube is 16/9. Make it 16/12 because of padding
export const youtubeSectionAspectRatio = 16 / 12;

function useIsX(sectionId, fn) {
  const isSocial = useIsSocial(sectionId);
  const url = useGetSectionInfo(sectionId, "social");
  return isSocial && fn(url);
}

export function useIsTwitter(sectionId) {
  return useIsX(sectionId, linkIsTwitter);
}

export function useIsYouTube(sectionId) {
  return useIsX(sectionId, linkIsYouTube);
}

export function linkIsYouTube(x) {
  return x && x.includes("youtube");
}

export function linkIsTwitter(x) {
  return x && x.includes("twitter");
}

export function useOpenCloseWebsocket() {
  const location = useLocation();

  useEffect(() => {
    openWebSocket(location.pathname);
  }, []);

  useEffect(() => {
    sendLocation(location.pathname);
  }, [location.pathname]);
}

export function useRequiredUIEditorTabs(sectionId) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  const uiTypeType = useUITypes((x) => x.x[uiTypeId].type);
  switch (uiTypeType) {
    case C.INFO:
      return [SECTION_CONFIG_TAB, INFO_CONFIG_TAB];
    case C.OUTPUT:
    case C.SOCIAL:
      return [SECTION_CONFIG_TAB];
    default:
      return [UI_CONFIG_TAB, SECTION_CONFIG_TAB, DB_SOURCES_TAB];
  }
}

export function useGetOverviewListing(sectionTypeFilter = null) {
  const topLevelSectionIds = useNodeInternals(
    (x) => [...x.x.keys()],
    _.isEqual,
  );
  const sectionChildren = useSectionInfos(
    (x) => _.mapValues(x.x, (v) => v.children),
    _.isEqual,
  );
  const idNames = useSectionInfoNames();
  const sectionTypeNames = useSectionTypeNames();

  const sectionList = getDepthListing(
    topLevelSectionIds,
    sectionChildren,
    idNames,
    sectionTypeNames,
    sectionTypeFilter,
  );

  return useMatchSorterFilter(sectionList, ["name"]);
}

export function useGetParamEnteredValue(sectionId, paramInfoId) {
  const dbSource = useMappedSectionDBSource(sectionId);
  const evColId = useGetSectionInfo(sectionId, "evColId");
  const previewEVColId = useGetSectionInfo(sectionId, "previewEVColId");

  // console.log("dbSource", dbSource);
  // console.log("evColId", evColId);
  // console.log("previewEVColId", previewEVColId);

  return useEVCols((x) => {
    if (dbSource in x.x) {
      return x.x[dbSource][previewEVColId ?? evColId].values[paramInfoId];
    }
    return "";
  });
}

export function useGetEVColNames(sectionId) {
  const dbSource = useMappedSectionDBSource(sectionId);
  const evColIds = useGetSectionInfo(sectionId, "evColIds");
  return useEVCols((x) => {
    if (dbSource in x.x) {
      return evColIds.map((e) => ({ id: e, name: x.x[dbSource][e].name }));
    }
    return [];
  }, _.isEqual);
}

export function useIdWaitingForLSPResult({ sectionId, paramInfoId }) {
  return useWaitingForLSPResult(
    (x) => x[idForLSPWaiting({ sectionId, paramInfoId })],
  );
}

export function useEditableOnSubmit(initialValue, onSetTitle, condition) {
  const [inputValue, setInputValue] = useState(initialValue);

  function onBlur(v) {
    if (v != "" && v != initialValue && condition(v)) {
      onSetTitle(v);
    } else {
      setInputValue(initialValue);
    }
  }

  function onCancel() {
    setInputValue(initialValue);
  }

  useEffect(() => {
    setInputValue(initialValue);
  }, [initialValue]);

  return [inputValue, setInputValue, onBlur, onCancel];
}

export function useTitleIsEditable(sectionId) {
  const sectionSubType = useGetSectionTypeConfig(sectionId, "subType");
  const isUneditableType = useIsOneOfType(sectionId, [
    C.OUTPUT,
    C.GLOBAL_VARIABLES,
    C.PARAM_SWEEP,
    C.GLOBAL_PARAM_SWEEP,
    C.VAR_CONTROL,
  ]);

  return requiresKeyInput(sectionSubType) && !isUneditableType;
}

export function useCurrInfoView() {
  return useInfoView((x) => x.currValue);
}
