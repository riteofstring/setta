import { thunk } from "easy-peasy";
import {
  createOriginInfoId,
  isFromSelfAndMatchesType,
} from "hooks/usePresetUIType";
import { cloneNewUIType } from "hooks/useUITypeCoreFunctions";
import _ from "lodash";
import { getSectionConfig, getSectionType } from "thunks/sections";
import { isListLike } from "utils/constants";
import { isPreset } from "utils/uiTypeConstants";
import { getParamChildId, getParamUIType } from "./paramInfos";

export const setUITypeId = thunk((action, payload, helpers) => {
  const { uiTypeId, settingSectionConfig, sectionId, paramInfoId } = payload;
  const s = helpers.getStoreState();
  const a = helpers.getStoreActions();
  const childId = getParamChildId(s, sectionId, paramInfoId);

  if (settingSectionConfig || (!settingSectionConfig && childId)) {
    a.thunks.setSectionConfigAttr({ sectionId, attr: "uiTypeId", value });
  }
  if ((settingSectionConfig && paramInfoId) || !settingSectionConfig) {
    a.thunks.setParamUITypeId({ sectionId, paramInfoId, uiTypeId });
  }
});

export const setUITypeConfig = thunk((action, payload, helpers) => {
  const {
    settingSectionConfig,
    sectionId,
    paramInfoId,
    defaultName,
    settingPreset = false,
    configProps,
  } = payload;

  const s = helpers.getStoreState();
  const a = helpers.getStoreActions();
  const childId = getParamChildId(s, sectionId, paramInfoId);
  const sectionTypeConfig = getSectionConfig(s, sectionId);
  const currUIType = settingSectionConfig
    ? getSectionType(s, sectionId)
    : getParamUIType(s, sectionId, paramInfoId);

  const originInfoId = createOriginInfoId({
    settingSectionConfig,
    sectionTypeConfig,
    paramInfoId,
    childId,
  });

  // Try using existing non-preset (uiType with same originInfoId and type)
  const possibleMatch = existingNonPresetMatchingType(
    s.uiTypes.x,
    currUIType,
    originInfoId
  );
  const _setUITypeId = (uiTypeId) =>
    a.thunks.setUITypeId({
      uiTypeId,
      settingSectionConfig,
      sectionId,
      paramInfoId,
    });
  const setConfig = a.uiTypes.setOneConfig;
  const setUIType = a.uiTypes.setUIType;

  getFnSetUITypeConfigAndMaybeClone({
    defaultName,
    currUIType,
    settingPreset,
    originInfoId,
    setUITypeId: _setUITypeId,
    setConfig,
    setUIType,
    possibleMatch,
    configProps,
  });
});

function existingNonPresetMatchingType(allUITypes, uiType, originInfoId) {
  const matches = _.filter(allUITypes, (v) =>
    isFromSelfAndMatchesType(v, originInfoId, uiType.type)
  );
  return matches.length > 0 ? matches[0] : null;
}

function shouldCloneUIType(uiType, settingPreset) {
  // uiType is a preset, and we're not in "settingPreset" mode
  const isPresetNotSettingPreset = isPreset(uiType) && !settingPreset;
  // The uiType is a list element (a child of a list root).
  // Changing its config shouldn't affect its siblings.
  // Plus it should become indepedent from the root config.
  const isList = isListLike(uiType.config.subType);
  return isPresetNotSettingPreset || isList;
}

function setChildUITypeConfig(uiType, props, setConfig) {
  const { childUITypeId } = uiType.config;
  if (childUITypeId) {
    setConfig({ uiTypeId: childUITypeId, ...props });
  }
}

function getFnSetUITypeConfigAndMaybeClone({
  defaultName,
  currUIType,
  settingPreset,
  originInfoId,
  setUITypeId,
  setConfig,
  setUIType,
  possibleMatch,
  configProps,
}) {
  // If it's a preset but we're not "saving as",
  // then use existing non-preset, or copy into a new non-preset ui type.
  let maybeNewUIType = currUIType;
  if (shouldCloneUIType(currUIType, settingPreset)) {
    // There's no match, so clone the preset into a non-preset
    if (!possibleMatch) {
      maybeNewUIType = cloneNewUIType({
        uiType: currUIType,
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

  setConfig({ uiTypeId: maybeNewUIType.id, ...configProps });

  // Changing a root config should also change its child config
  setChildUITypeConfig(maybeNewUIType, configProps, setConfig);
}
