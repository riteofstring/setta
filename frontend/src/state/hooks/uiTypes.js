import C from "constants/constants.json";
import _ from "lodash";
import { useSectionInfos } from "state/definitions";
import {
  BASE_UI_TYPE_IDS,
  INFO_CONFIG_TAB,
  QUICKINFO_CONFIG_TAB,
  SECTION_CONFIG_TAB,
  SECTION_DISPLAY_MODES,
  SECTION_VARIANTS_TAB,
  UI_CONFIG_TAB,
} from "utils/constants";
import { isRoot } from "utils/sectionTypeHelpers";
import { localStorageFns } from "./localStorage";
import { useGetSectionInfo } from "./sections";

export function useGetParamUIType(sectionId, paramInfoId) {
  const uiTypeId = useParamUITypeId(sectionId, paramInfoId);
  return useSectionInfos((x) => x.uiTypes[uiTypeId], _.isEqual);
}

function useUITypeCol(sectionId, paramInfoId, key) {
  return useSectionInfos((x) => {
    const { uiTypeColId } = x.x[sectionId];
    if (paramInfoId.startsWith(C.JSON_SOURCE_PREFIX)) {
      if (paramInfoId in x.uiTypeCols[uiTypeColId]) {
        return x.uiTypeCols[uiTypeColId][paramInfoId][key];
      } else if (key === "uiTypeId") {
        return BASE_UI_TYPE_IDS[C.TEXT];
      } else if (key === "nonPresetUITypeIds") {
        return [];
      }
    }
    return x.uiTypeCols[uiTypeColId][paramInfoId][key];
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
  return useSectionInfos((x) => x.uiTypes[uiTypeId][key], equalityFn);
}

function useIsSeriesElementHelper(sectionId, parentTypesToCheck) {
  const parentId = useGetSectionInfo(sectionId, "parentId");
  const uiTypeId = useSectionInfos((x) =>
    parentId ? x.x[parentId].uiTypeId : null,
  );
  return useSectionInfos((x) =>
    uiTypeId ? parentTypesToCheck.includes(x.uiTypes[uiTypeId].type) : false,
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
  return useSectionInfos((x) => x.uiTypes[uiTypeId].type);
}

export function useSectionTypeNames() {
  const sectionIdToUITypeId = useSectionInfos(
    (x) => _.mapValues(x.x, (s) => s.uiTypeId),
    _.isEqual,
  );
  return useSectionInfos((x) =>
    _.mapValues(sectionIdToUITypeId, (s) => x.uiTypes[s].type),
  );
}

function useIsType(sectionId, type) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useSectionInfos((x) => x.uiTypes[uiTypeId].type === type);
}

export function useIsOneOfType(sectionId, types) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useSectionInfos((x) => types.includes(x.uiTypes[uiTypeId].type));
}

export function useIsRoot(sectionId) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  return useSectionInfos((x) => isRoot(x.uiTypes[uiTypeId].type));
}

export function useIsDeck(sectionId) {
  return useIsType(sectionId, C.DECK);
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
  const uiTypeId = useSectionInfos((x) =>
    sectionId ? x.x[sectionId].uiTypeId : null,
  );
  const uiTypeName = useSectionInfos((x) =>
    uiTypeId ? x.uiTypes[uiTypeId].type : null,
  );
  const [_storedTab] = localStorageFns.uiEditorTab.hook();
  return { ...getUIEditorTab(uiTypeName, _storedTab), uiTypeName };
}

function getRequiredUIEditorTabs(uiTypeName) {
  switch (uiTypeName) {
    case C.SECTION:
    case C.GLOBAL_VARIABLES:
      return [
        SECTION_CONFIG_TAB,
        UI_CONFIG_TAB,
        QUICKINFO_CONFIG_TAB,
        SECTION_VARIANTS_TAB,
      ];
    case C.LIST_ROOT:
    case C.DICT_ROOT:
    case C.CODE:
    case C.INTERACTIVE_CODE:
      return [SECTION_CONFIG_TAB, SECTION_VARIANTS_TAB];
    case C.INFO:
      return [SECTION_CONFIG_TAB, INFO_CONFIG_TAB, SECTION_VARIANTS_TAB];
    case C.SOCIAL:
      return [SECTION_CONFIG_TAB];
    case C.PARAM_SWEEP:
      return [SECTION_VARIANTS_TAB];
    case C.DECK:
    case C.TERMINAL:
    case C.GLOBAL_PARAM_SWEEP:
    case C.DRAW:
      return [SECTION_CONFIG_TAB];
    case C.IMAGE:
    case C.LINE_PLOT:
      return [];
    default:
      return [
        SECTION_CONFIG_TAB,
        UI_CONFIG_TAB,
        QUICKINFO_CONFIG_TAB,
        INFO_CONFIG_TAB,
        SECTION_VARIANTS_TAB,
      ];
  }
}

export function getDefaultDisplayMode(uiTypeId) {
  const uiType = useSectionInfos.getState().uiTypes[uiTypeId].type;
  switch (uiType) {
    case C.INFO:
      return SECTION_DISPLAY_MODES.RENDER;
    default:
      return SECTION_DISPLAY_MODES.GUI;
  }
}

export function getUIEditorTab(uiTypeName, _storedTab) {
  const requiredTabs = getRequiredUIEditorTabs(uiTypeName);
  const storedTab = _storedTab?.[uiTypeName] ?? SECTION_CONFIG_TAB;
  // when sectionId changes, the requiredTabs might not include the previously active tab
  const tab = requiredTabs.includes(storedTab) ? storedTab : requiredTabs[0];
  return { tab, requiredTabs: new Set(requiredTabs) };
}
