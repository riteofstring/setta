import C from "constants/constants.json";
import _ from "lodash";
import { useSectionInfos, useUITypeCols, useUITypes } from "state/definitions";
import {
  BASE_UI_TYPE_IDS,
  INFO_CONFIG_TAB,
  QUICKINFO_CONFIG_TAB,
  SECTION_CONFIG_TAB,
  SECTION_VARIANTS_TAB,
  UI_CONFIG_TAB,
} from "utils/constants";
import { isRoot } from "utils/sectionTypeHelpers";
import { localStorageFns } from "./localStorage";
import { useGetSectionInfo } from "./sections";

export function useGetParamUIType(sectionId, paramInfoId) {
  const uiTypeId = useParamUITypeId(sectionId, paramInfoId);
  return useUITypes((x) => x.x[uiTypeId], _.isEqual);
}

function useUITypeCol(sectionId, paramInfoId, key) {
  const uiTypeColId = useGetSectionInfo(sectionId, "uiTypeColId");
  return useUITypeCols((x) => {
    if (paramInfoId.startsWith(C.JSON_SOURCE_PREFIX)) {
      if (key === "uiTypeId") {
        return BASE_UI_TYPE_IDS[C.TEXT];
      } else if (key === "nonPresetUITypeIds") {
        return [];
      } else {
        console.error("unexpected key in useUITypeCol", key);
      }
    }
    return x.y[uiTypeColId][paramInfoId][key];
  });
}

function useParamUITypeId(sectionId, paramInfoId) {
  return useUITypeCol(sectionId, paramInfoId, "uiTypeId");
}

export function useParamNonPresetUITypeIds(sectionId, paramInfoId) {
  return useUITypeCol(sectionId, paramInfoId, "nonPresetUITypeIds");
}

export function useGetSectionType(sectionId, key) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  const nonScalars = ["config"];
  const equalityFn = nonScalars.includes(key) ? _.isEqual : undefined;
  return useUITypes((x) => x.x[uiTypeId][key], equalityFn);
}

function useIsSeriesElementHelper(sectionId, parentTypesToCheck) {
  const parentId = useGetSectionInfo(sectionId, "parentId");
  const uiTypeId = useSectionInfos((x) =>
    parentId ? x.x[parentId].uiTypeId : null,
  );
  return useUITypes((x) =>
    uiTypeId ? parentTypesToCheck.includes(x.x[uiTypeId].type) : false,
  );
}

export function useIsSeriesElement(sectionId) {
  return useIsSeriesElementHelper(sectionId, [C.LIST_ROOT, C.DICT_ROOT]);
}

export function useIsListElement(sectionId) {
  return useIsSeriesElementHelper(sectionId, [C.LIST_ROOT]);
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

export function useIsArtifact(sectionId) {
  return useIsType(sectionId, C.ARTIFACT);
}

export function useIsSocial(sectionId) {
  return useIsType(sectionId, C.SOCIAL);
}

export function useIsGlobalVariables(sectionId) {
  return useIsType(sectionId, C.GLOBAL_VARIABLES);
}

export function useIsTerminal(sectionId) {
  return useIsType(sectionId, C.TERMINAL);
}

export function useIsInteractiveCode(sectionId) {
  return useIsType(sectionId, C.INTERACTIVE_CODE);
}

export function useIsDrawArea(sectionId) {
  return useIsType(sectionId, C.DRAW);
}

export function useUIEditorTab(sectionId) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  const uiTypeName = useUITypes((x) => x.x[uiTypeId].type);
  const requiredTabs = getRequiredUIEditorTabs(uiTypeName);
  const [_storedTab, _setStoredTab] = localStorageFns["uiEditorTab"].hook();
  const storedTab = _storedTab[uiTypeName] ?? SECTION_CONFIG_TAB;

  // when sectionId changes, the requiredTabs might not include the previously active tab
  const tab = requiredTabs.includes(storedTab) ? storedTab : requiredTabs[0];
  const setTab = (newTabState) =>
    _setStoredTab((state) => ({ ...state, [uiTypeName]: newTabState }));
  return [tab, setTab, requiredTabs];
}

function getRequiredUIEditorTabs(uiTypeName) {
  switch (uiTypeName) {
    case C.INFO:
      return [SECTION_CONFIG_TAB, INFO_CONFIG_TAB];
    case C.ARTIFACT:
    case C.SOCIAL:
      return [SECTION_CONFIG_TAB];
    default:
      return [
        UI_CONFIG_TAB,
        QUICKINFO_CONFIG_TAB,
        // SECTION_CONFIG_TAB,
        SECTION_VARIANTS_TAB,
      ];
  }
}
