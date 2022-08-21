import _ from "lodash";
import {
  isListLike,
  SECTION_TYPE_NAMES,
  SET_FROM_SIDEPANE,
} from "utils/constants";
import { createNewId } from "utils/utils";
import {
  createOriginInfoId,
  isFromSelfAndMatchesType,
} from "./usePresetUIType";

function shouldCloneUIType(uiType, settingPreset) {
  // uiType is a preset, and we're not in "settingPreset" mode
  const isPresetNotSettingPreset = uiType.isPreset && !settingPreset;
  // The uiType is a list element (a child of a list root).
  // Changing its config shouldn't affect its siblings.
  // Plus it should become indepedent from the root config.
  const isList = isListLike(uiType.config.subType);
  return isPresetNotSettingPreset || isList;
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
  newUIType.isBasePreset = false;
  newUIType.originInfoId = originInfoId;
  if (!_.isNil(config)) {
    newUIType.config = config;
    if (SECTION_TYPE_NAMES.includes(newUIType.type)) {
      newUIType.config.uiTypeCollectionId = createNewId();
    }
  }
  newUIType.isForChildOfOriginInfoId = isForChildOfOriginInfoId;
  return newUIType;
}

function setChildUITypeConfig(uiType, props, setConfig) {
  const { childUITypeId } = uiType.config;
  if (childUITypeId) {
    setConfig({ uiTypeId: childUITypeId, ...props });
  }
}

function existingNonPresetMatchingType(uiType, originInfoId, uiTypeState) {
  const matches = _.filter(uiTypeState, (v) =>
    isFromSelfAndMatchesType(v, originInfoId, uiType.type)
  );
  return matches.length > 0 ? matches[0] : null;
}

export function getFnSetUITypeConfigAndMaybeClone({
  defaultName,
  currUIType,
  settingPreset,
  originInfoId,
  setUITypeId,
  setConfig,
  setUIType,
  possibleMatch,
}) {
  return (props) => {
    // If it's a preset but we're not "saving as",
    // then use existing non-preset, or copy into a new non-preset ui type.
    let maybeNewUIType = currUIType;
    if (shouldCloneUIType(currUIType, settingPreset)) {
      // There's no match, so clone the preset into a non-preset
      if (!possibleMatch) {
        console.log("cloning!");
        maybeNewUIType = cloneNewUIType({
          uiType: currUIType,
          name: defaultName,
          originInfoId,
        });
        setUIType({ uiType: maybeNewUIType });
      } else {
        console.log("using possibleMatch!");
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

export function getFnSetUIType({
  paramInfoId,
  defaultName,
  childId,
  currUIType,
  settingPreset = false,
  settingSectionConfig,
  sectionTypeConfig,
  setParamUITypeId,
  setSectionUITypeId,
  setConfig,
  setUIType,
  allUITypes,
}) {
  const setUITypeId = settingSectionConfig
    ? setSectionUITypeId
    : setParamUITypeId;

  const originInfoId = createOriginInfoId({
    settingSectionConfig,
    sectionTypeConfig,
    paramInfoId,
    childId,
  });

  // Try using existing non-preset (uiType with same originInfoId and type)
  const possibleMatch = existingNonPresetMatchingType(
    currUIType,
    originInfoId,
    allUITypes
  );

  const setOtherId = (newId) => {
    if (settingSectionConfig && paramInfoId) {
      console.log("setting param ui type id");
      setParamUITypeId(newId);
    } else if (!settingSectionConfig && childId) {
      setSectionUITypeId(newId);
    }
  };

  const _setUITypeId = (newId) => {
    setUITypeId(newId);
    setOtherId(newId);
  };

  const setUITypeConfig = getFnSetUITypeConfigAndMaybeClone({
    defaultName,
    currUIType,
    settingPreset,
    originInfoId,
    setUITypeId: _setUITypeId,
    setConfig,
    setUIType,
    possibleMatch,
  });

  return [_setUITypeId, setUITypeConfig];
}
