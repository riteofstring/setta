import { useStoreActions, useStoreState } from "easy-peasy";
import _ from "lodash";
import { createNewId, defaultState } from "utils/utils";

import {
  DEFAULT_DEFAULT_UI_TYPE_ID,
  isListLike,
  rootTypeToChildType,
  SECTION,
  SET_FROM_SIDEPANE,
} from "../utils/constants";
import { useParamUITypeId } from "./useParamInfo";
import { isFromSelfAndMatchesType } from "./usePresetUIType";
import { useSetSectionUITypeId } from "./useSectionInfo";
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

function useExistingNonPresetMatchingType(uiType, originInfoId) {
  const matches = useStoreState(
    (x) =>
      _.filter(x.uiTypes.x, (v) =>
        isFromSelfAndMatchesType(v, [originInfoId], uiType.type)
      ),
    _.isEqual
  );
  return matches.length > 0 ? matches[0] : null;
}

function setChildUITypeConfig(uiType, props, setConfig) {
  const { childUITypeId } = uiType.config;
  if (childUITypeId) {
    setConfig({ uiTypeId: childUITypeId, ...props });
  }
}

function shouldCloneUIType(uiType, settingPreset) {
  // uiType is a preset, and we're not in "settingPreset" mode
  const isPresetNotSettingPreset = uiType.isPreset && !settingPreset;
  // The uiType is a list element (a child of a list root).
  // Changing its config shouldn't affect its siblings.
  // Plus it should become indepedent from the root config.
  const isList = isListLike(uiType.config.subType);
  return isPresetNotSettingPreset || isList;
}

function useSetUITypeConfig(
  defaultName,
  uiType,
  settingPreset,
  originInfoId,
  setUITypeId
) {
  const setConfig = useStoreActions((x) => x.uiTypes.setOneConfig);
  const setUIType = useStoreActions((x) => x.uiTypes.setUIType);
  // Try using existing non-preset (uiType with same originInfoId and type)
  const possibleMatch = useExistingNonPresetMatchingType(uiType, originInfoId);
  return (props) => {
    // If it's a preset but we're not "saving as",
    // then use existing non-preset, or copy into a new non-preset ui type.
    let maybeNewUIType = uiType;
    if (shouldCloneUIType(uiType, settingPreset)) {
      // There's no match, so clone the preset into a non-preset
      if (!possibleMatch) {
        maybeNewUIType = cloneNewUIType({
          uiType,
          name: defaultName,
          originInfoId,
        });
        setUIType({ uiType: maybeNewUIType });
      } else {
        maybeNewUIType = possibleMatch;
      }
      // In both cases, make the section or param to use the new or existing id
      setUITypeId(maybeNewUIType.id);
    }
    setConfig({ uiTypeId: maybeNewUIType.id, ...props });

    // Changing a root config should also change its child config
    setChildUITypeConfig(maybeNewUIType, props, setConfig);
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
  const setParamUITypeId = useParamUITypeId(sectionId)(paramInfoId)[1];
  const setSectionUITypeId = useSetSectionUITypeId(childId);
  const setUITypeId = settingSectionConfig
    ? setSectionUITypeId
    : setParamUITypeId;
  const originInfoId = createOriginInfoId({
    settingSectionConfig,
    childId,
    paramInfoId,
  });

  const setOtherId = (newId) => {
    if (settingSectionConfig && paramInfoId) {
      setParamUITypeId(newId);
    } else if (!settingSectionConfig && childId) {
      setSectionUITypeId(newId);
    }
  };

  const _setUITypeId = (newId) => {
    setUITypeId(newId);
    setOtherId(newId);
  };

  const setUITypeConfig = useSetUITypeConfig(
    defaultName,
    currUIType,
    settingPreset,
    originInfoId,
    _setUITypeId
  );

  return [_setUITypeId, setUITypeConfig];
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

export function cloneNewUIType({
  uiType,
  name = "",
  config,
  origin = SET_FROM_SIDEPANE,
  isPreset = false,
  originInfoId,
  isForChildOfOriginInfoId = false,
}) {
  const newUIType = _.cloneDeep(uiType);
  newUIType.id = createNewId();
  newUIType.name = name;
  newUIType.origin = origin;
  newUIType.isPreset = isPreset;
  newUIType.originInfoId = originInfoId;
  if (!_.isNil(config)) {
    newUIType.config = config;
  }
  newUIType.isForChildOfOriginInfoId = isForChildOfOriginInfoId;
  return newUIType;
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
        setUITypeId(DEFAULT_DEFAULT_UI_TYPE_ID);
      }
    };
  };
}

function cloneRootUIType(parentUIType, parentSectionId) {
  const uiType = _.cloneDeep(parentUIType);
  uiType.id = createNewId();
  uiType.type = SECTION;
  uiType.config.subType = rootTypeToChildType[parentUIType.type];
  uiType.isPreset = false;
  uiType.originInfoId = createOriginInfoId({
    isChildOfRoot: true,
    rootSectionId: parentSectionId,
  });
  uiType.isForChildOfOriginInfoId = true;
  return uiType;
}

function getChildUITypeId(
  parentUIType,
  parentSectionId,
  setUIType,
  setOneConfig
) {
  // If a childUIType was created before, then the parentUIType will have its id
  const { childUITypeId } = parentUIType.config;
  if (childUITypeId) {
    return childUITypeId;
  }

  // Otherwise, a child ui type needs to be created
  const newUIType = cloneRootUIType(parentUIType, parentSectionId);
  const id = newUIType.id;
  setOneConfig({
    uiTypeId: parentUIType.id,
    configName: "childUITypeId",
    newValueFn: () => id,
  });
  setUIType({ uiType: newUIType });
  return id;
}

export function useGetChildUITypeId() {
  const setUIType = useStoreActions((x) => x.uiTypes.setUIType);
  const setOneConfig = useStoreActions((x) => x.uiTypes.setOneConfig);

  return (uiTypeId, parentUIType, parentSectionId) => {
    if (uiTypeId) {
      return uiTypeId;
    }
    return getChildUITypeId(
      parentUIType,
      parentSectionId,
      setUIType,
      setOneConfig
    );
  };
}

export function createOriginInfoId({
  isPreset,
  settingSectionConfig,
  childId,
  paramInfoId,
  isChildOfRoot,
  rootSectionId,
}) {
  if (isPreset) {
    return null;
  } else if (isChildOfRoot) {
    return rootSectionId;
  }
  return settingSectionConfig ? childId : paramInfoId;
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
// The child uiType's originInfoId is the list root's section id.
// The child uiType also has isForChildOfOriginInfoId=true.
// Available uitypes a section match by originInfoId=sectionId and isForChildOfOriginInfoId=false
// AND originInfoId=parentId and isForChildOfOriginInfoId=true
// The problem with this is that child sections will see "lingering" ui types when parents change from list root to something else.
// These lingering ui types can't be deleted, because the child sections are stored in history
// and need access to those ui types if they are ever re-rendered (i.e. if the parent becomes a list root again).
// So in addition checking isForChildOfOriginInfoId, a section needs to check if its parent is a root.
// The check is:
// (originInfoId=sectionId && isForChildOfOriginInfoId=false) || (parentIsRoot && originInfoId=parentId && isForChildOfOriginInfoId=true)
