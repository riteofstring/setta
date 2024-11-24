import C from "constants/constants.json";
import _ from "lodash";
import {
  useActiveSection,
  useSectionInfos,
  useUITypeCols,
  useUITypes,
} from "state/definitions";
import { getSectionType } from "state/getters/sectionInfo";
import {
  BASE_UI_TYPE_IDS,
  INFO_CONFIG_TAB,
  QUICKINFO_CONFIG_TAB,
  SECTION_CONFIG_TAB,
  SECTION_DISPLAY_MODES,
  SECTION_VARIANTS_TAB,
  UI_CONFIG_TAB,
  UI_EDITOR,
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
      if (paramInfoId in x.y[uiTypeColId]) {
        return x.y[uiTypeColId][paramInfoId][key];
      } else if (key === "uiTypeId") {
        return BASE_UI_TYPE_IDS[C.TEXT];
      } else if (key === "nonPresetUITypeIds") {
        return [];
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
  const uiTypeName = useUITypes((x) => (uiTypeId ? x.x[uiTypeId].type : null));
  const [storedTab, setStoredTab] = localStorageFns["uiEditorTab"].hook();
  return getUiEditorTabAndTabSetter(uiTypeName, storedTab, setStoredTab);
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
  const uiType = useUITypes.getState().x[uiTypeId].type;
  switch (uiType) {
    case C.INFO:
      return SECTION_DISPLAY_MODES.RENDER;
    default:
      return SECTION_DISPLAY_MODES.GUI;
  }
}

function getUiEditorTabAndTabSetter(
  uiTypeName,
  inputStoredTab,
  inputSetStoredTab,
) {
  const requiredTabs = getRequiredUIEditorTabs(uiTypeName);
  const _storedTab = inputStoredTab ?? localStorageFns.uiEditorTab.state()[0];
  const storedTab = _storedTab[uiTypeName] ?? SECTION_CONFIG_TAB;
  console.log("storedTab", storedTab);
  // when sectionId changes, the requiredTabs might not include the previously active tab
  const tab = requiredTabs.includes(storedTab) ? storedTab : requiredTabs[0];
  const _setStoredTab =
    inputSetStoredTab ?? localStorageFns.uiEditorTab.state()[1];
  const setTab = (newTabState) => {
    console.log("newTabState", newTabState);
    _setStoredTab((state) => ({ ...state, [uiTypeName]: newTabState }));
  };
  return { tab, setTab, requiredTabs: new Set(requiredTabs) };
}

function getOverviewTabAndTabSetter() {
  const [tab, setTab] = localStorageFns.overviewTab.state();
  return { tab, setTab };
}

export function getTabAndTabSetter(paneName, uiTypeName) {
  if (paneName === UI_EDITOR) {
    return getUiEditorTabAndTabSetter(uiTypeName);
  }
  return getOverviewTabAndTabSetter();
}

function changeUIEditorTab(tabName) {
  const activeId = useActiveSection.getState().ids[0];
  if (!activeId) {
    return;
  }
  const uiTypeName = getSectionType(activeId).type;
  const setStoredTab = localStorageFns.uiEditorTab.state()[1];
  setStoredTab((state) => {
    return { ...state, [uiTypeName]: tabName };
  });
}

export function showVersionsTab() {
  changeUIEditorTab(SECTION_VARIANTS_TAB);
}
