import { useStoreActions, useStoreState } from "easy-peasy";
import _ from "lodash";
import { createNewId, defaultState } from "utils/utils";

import {
  DEFAULT_BASE_UI_TYPE_ID,
  rootTypeToChildType,
  SECTION,
} from "../utils/constants";
import { useParamUITypeId } from "./useParamInfo";
import { createOriginInfoId } from "./usePresetUIType";
import { useSetSectionConfigAttr } from "./useSectionConfig";
import { useGetSectionType } from "./useSectionType";
import { getFnSetUIType } from "./useUITypeCoreFunctions";
import { getInfo } from "./utils";

export function useGetParamUIType(sectionId) {
  const uiTypeIdFn = useParamUITypeId(sectionId);
  return (paramInfoId) => {
    const uiTypeId = uiTypeIdFn(paramInfoId)[0];
    return defaultState(
      useStoreState((x) => getInfo(x.uiTypes)[uiTypeId]),
      () => ({})
    );
  };
}

export function useSetUIType({
  sectionId,
  paramInfoId,
  defaultName,
  childId,
  currUIType,
  settingPreset = false,
  settingSectionConfig,
}) {
  const { config: sectionTypeConfig } = useGetSectionType(sectionId);
  const setParamUITypeId = useParamUITypeId(sectionId)(paramInfoId)[1];
  const setSectionUITypeId = useSetSectionConfigAttr(childId, "uiTypeId");
  const setConfig = useStoreActions((x) => x.uiTypes.setOneConfig);
  const setUIType = useStoreActions((x) => x.uiTypes.setUIType);
  const possibleMatchWrapperFn = (fn) =>
    useStoreState((x) => fn(x.uiTypes.x), _.isEqual);

  return getFnSetUIType({
    paramInfoId,
    defaultName,
    childId,
    currUIType,
    settingPreset,
    settingSectionConfig,
    sectionTypeConfig,
    setParamUITypeId,
    setSectionUITypeId,
    setConfig,
    setUIType,
    possibleMatchWrapperFn,
  });
}

function useProjectDefaultUIType(paramInfoId) {
  const uiTypeId = useStoreState(
    (x) => x.projectParamDefaults.x[paramInfoId]?.uiTypeId
  );
  return useStoreState((x) => x.uiTypes.x[uiTypeId]);
}

function useGlobalDefaultUIType(paramType) {
  const uiTypeId = useStoreState(
    (x) => x.globalParamDefaults.x[paramType]?.uiTypeId
  );
  return useStoreState((x) => x.uiTypes.x[uiTypeId]);
}

export function useInitializeUIType(sectionId) {
  const uiTypeFn = useParamUITypeId(sectionId);
  return (paramInfo) => {
    const [uiTypeId, setUITypeId] = uiTypeFn(paramInfo.id);
    const projectDefaultUIType = useProjectDefaultUIType(paramInfo.id);
    const globalDefaultUIType = useGlobalDefaultUIType(paramInfo.type);
    return () => {
      if (uiTypeId) {
        return;
      } else if (projectDefaultUIType) {
        setUITypeId(projectDefaultUIType.id);
      } else if (globalDefaultUIType) {
        setUITypeId(globalDefaultUIType.id);
      } else {
        setUITypeId(DEFAULT_BASE_UI_TYPE_ID);
      }
    };
  };
}

function cloneRootUIType(parentUIType, parentId) {
  const uiType = _.cloneDeep(parentUIType);
  uiType.id = createNewId();
  uiType.type = SECTION;
  uiType.config.uiTypeColId = createNewId();
  uiType.config.subType = rootTypeToChildType[parentUIType.type];
  uiType.presetType = null;
  uiType.originInfoId = createOriginInfoId({
    isChildOfRoot: true,
    rootId: parentId,
  });
  uiType.isForChildOfOriginInfoId = true;
  return uiType;
}

export function getChildUITypeId(
  parentUIType,
  parentId,
  setUIType,
  setOneConfig
) {
  // If a childUIType was created before, then the parentUIType will have its id
  const { childUITypeId } = parentUIType.config;
  if (childUITypeId) {
    return childUITypeId;
  }

  // Otherwise, a child ui type needs to be created
  const newUIType = cloneRootUIType(parentUIType, parentId);
  const id = newUIType.id;
  setOneConfig({
    uiTypeId: parentUIType.id,
    configName: "childUITypeId",
    newValueFn: () => id,
  });
  setUIType({ uiType: newUIType });
  return id;
}

// Root sections and child behavior:

// ##### Root controlling children #####
// The first child section causes a new ui type to be created.
// This new ui type id is added to the root ui type's config as "childUITypeId".
// All future child sections now use this childUITypeId.
// So the default is that all children use the same ui type.
// Whenever the root config changes, the child config also changes.
// Because all the children are using the same ui type, all children's configs changes when the root config changes.

// ##### Children becoming independent #####
// Modifying a child's config makes it become independent of the root and the siblings.
// So now if you modify the root config, the independent child is not affected.

// OriginInfoId behavior:

// Approach 1:
// A list root creates a child uitype.
// The child uiType's originInfoId is the list root's originInfoId.
// The child uiType also has isForChildOfOriginInfoId=true.
// Available uitypes a section match by originInfoIdMatches and isForChildOfOriginInfoId=false
// AND originInfoIdMatches and isForChildOfOriginInfoId=true
// The problem with this is that child sections will see "lingering" ui types when parents change from list root to something else.
// These lingering ui types can't be deleted, because the child sections are stored in history
// and need access to those ui types if they are ever re-rendered (i.e. if the parent becomes a list root again).
// So in addition checking isForChildOfOriginInfoId, a section needs to check if its parent is a root.
// The check is:
// (originInfoIdMatches && isForChildOfOriginInfoId=false) || (parentIsRoot && originInfoIdMatches && isForChildOfOriginInfoId=true)

// originInfoId format: {uiTypeColId, paramInfoId} or {sectionId}
// When changing a param's uitype, the uiTypeColId is from the section's uiType, and paramInfoId is from the param.
// When changing a nested param's uitype, the uiTypeColId is from the PARENT section's uiType, and paramInfoId is from the param.
// When changing a section not associated with a param, use sectionId
