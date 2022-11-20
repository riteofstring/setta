import { thunk } from "easy-peasy";
import { isFromSelfAndMatchesType } from "hooks/usePresetUIType";
import _ from "lodash";
import { getSectionType, getSectionTypeConfig } from "thunks/sections";
import { isListLike } from "utils/constants";
import { isPreset } from "utils/uiTypeConstants";
import { cloneNewUIType, createOriginInfoId } from "utils/uiTypeUtils";
import { getParamChildId, getParamUIType } from "./paramInfos";

export const setSectionUITypeId = thunk((action, payload, helpers) => {
  const { uiTypeId, sectionId } = payload;
  const s = helpers.getStoreState();
  const a = helpers.getStoreActions();
  const { parentId, paramInfoId } = s.sectionInfos.x[sectionId];

  a.thunks.setSectionConfigAttr({
    sectionId,
    attr: "uiTypeId",
    value: uiTypeId,
  });

  if (paramInfoId) {
    a.thunks.setParamUITypeId({ sectionId: parentId, paramInfoId, uiTypeId });
  }
});

export const setParamUITypeId = thunk((action, payload, helpers) => {
  const { uiTypeId, sectionId, paramInfoId } = payload;
  const s = helpers.getStoreState();
  const a = helpers.getStoreActions();
  const childId = getParamChildId(s, sectionId, paramInfoId);
  const { uiTypeColId } = getSectionTypeConfig(s, sectionId);

  a.paramInfos.setUITypeId({
    collectionId: uiTypeColId,
    paramInfoId,
    uiTypeId,
  });

  if (childId) {
    a.thunks.setSectionConfigAttr({
      sectionId: childId,
      attr: "uiTypeId",
      value: uiTypeId,
    });
  }
});

export const setSectionUITypeConfig = thunk((action, payload, helpers) => {
  const { sectionId, settingPreset = false, configProps } = payload;
  const s = helpers.getStoreState();
  const a = helpers.getStoreActions();
  const {
    name: defaultName,
    parentId,
    paramInfoId,
  } = s.sectionInfos.x[sectionId];
  const currUIType = getSectionType(s, sectionId);
  const parentSectionTypeConfig = paramInfoId
    ? getSectionTypeConfig(s, parentId)
    : null;

  const originInfoId = createOriginInfoId({
    settingSectionConfig: true,
    sectionTypeConfig: parentSectionTypeConfig,
    paramInfoId,
    childId: sectionId,
  });

  const setUITypeId = (uiTypeId) =>
    a.thunks.setSectionUITypeId({ uiTypeId, sectionId });

  a.thunks.setUITypeConfigAndMaybeClone({
    defaultName,
    currUIType,
    settingPreset,
    originInfoId,
    setUITypeId,
    configProps,
  });
});

export const setParamUITypeConfig = thunk((action, payload, helpers) => {
  const {
    sectionId,
    paramInfoId,
    settingPreset = false,
    configProps,
  } = payload;

  const s = helpers.getStoreState();
  const a = helpers.getStoreActions();
  const defaultName = s.codeInfo.allCodeInfo[paramInfoId].name;
  const sectionTypeConfig = getSectionTypeConfig(s, sectionId);
  const currUIType = getParamUIType(s, sectionId, paramInfoId);

  const originInfoId = createOriginInfoId({
    settingSectionConfig: false,
    sectionTypeConfig,
    paramInfoId,
  });
  const setUITypeId = (uiTypeId) =>
    a.thunks.setParamUITypeId({ uiTypeId, sectionId, paramInfoId });

  a.thunks.setUITypeConfigAndMaybeClone({
    defaultName,
    currUIType,
    settingPreset,
    originInfoId,
    setUITypeId,
    configProps,
  });
});

export const setUITypeConfigAndMaybeClone = thunk(
  (action, payload, helpers) => {
    const {
      defaultName,
      currUIType,
      settingPreset,
      originInfoId,
      setUITypeId,
      configProps,
    } = payload;
    const s = helpers.getStoreState();
    const a = helpers.getStoreActions();
    const setConfig = a.uiTypes.setOneConfig;
    const setUIType = a.uiTypes.setUIType;

    // If it's a preset but we're not "saving as",
    // then use existing non-preset, or copy into a new non-preset ui type.
    let maybeNewUIType = currUIType;
    if (shouldCloneUIType(currUIType, settingPreset)) {
      // Try using existing non-preset (uiType with same originInfoId and type)
      const possibleMatch = existingNonPresetMatchingType(
        s.uiTypes.x,
        currUIType,
        originInfoId
      );

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
);

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
