import { isFromSelfAndMatchesType } from "hooks/usePresetUIType";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import {
  getSectionType,
  getSectionTypeConfig,
  setSectionConfigAttr,
} from "thunks/sections";
import { isSeriesElement } from "utils/constants";
import { isPreset } from "utils/uiTypeConstants";
import { cloneNewUIType, createOriginInfoId } from "utils/uiTypeUtils";
import { getParamChildId, getParamUIType } from "./paramInfos";

export function setSectionUITypeId({ uiTypeId, sectionId }) {
  const { parentId, paramInfoId } = useSectionInfos.getState().x[sectionId];

  setSectionConfigAttr({
    sectionId,
    attr: "uiTypeId",
    value: uiTypeId,
  });

  if (paramInfoId) {
    setParamUITypeId({ sectionId: parentId, paramInfoId, uiTypeId });
  }
}

export function setParamUITypeId({ uiTypeId, sectionId, paramInfoId }) {
  const childId = getParamChildId(sectionId, paramInfoId);
  const { uiTypeColId } = getSectionTypeConfig(sectionId);

  useParamInfos.getState().setUITypeId({
    collectionId: uiTypeColId,
    paramInfoId,
    uiTypeId,
  });

  if (childId) {
    setSectionConfigAttr({
      sectionId: childId,
      attr: "uiTypeId",
      value: uiTypeId,
    });
  }
}

export function setSectionUITypeConfig({
  sectionId,
  settingPreset = false,
  configProps,
}) {
  const {
    name: defaultName,
    parentId,
    paramInfoId,
  } = useSectionInfos.getState().x[sectionId];
  const currUIType = getSectionType(sectionId);
  const parentSectionTypeConfig = paramInfoId
    ? getSectionTypeConfig(parentId)
    : null;

  const originInfoId = createOriginInfoId({
    settingSectionConfig: true,
    sectionTypeConfig: parentSectionTypeConfig,
    paramInfoId,
    childId: sectionId,
  });

  const setUITypeId = (uiTypeId) => setSectionUITypeId({ uiTypeId, sectionId });

  setUITypeConfigAndMaybeClone({
    defaultName,
    currUIType,
    settingPreset,
    originInfoId,
    setUITypeId,
    configProps,
  });
}

export function setParamUITypeConfig({
  sectionId,
  paramInfoId,
  settingPreset = false,
  configProps,
}) {
  const defaultName = useCodeInfo.getState().allCodeInfo[paramInfoId].name;
  const sectionTypeConfig = getSectionTypeConfig(sectionId);
  const currUIType = getParamUIType(sectionId, paramInfoId);

  const originInfoId = createOriginInfoId({
    settingSectionConfig: false,
    sectionTypeConfig,
    paramInfoId,
  });
  const setUITypeId = (uiTypeId) =>
    setParamUITypeId({ uiTypeId, sectionId, paramInfoId });

  setUITypeConfigAndMaybeClone({
    defaultName,
    currUIType,
    settingPreset,
    originInfoId,
    setUITypeId,
    configProps,
  });
}

function setUITypeConfigAndMaybeClone({
  defaultName,
  currUIType,
  settingPreset,
  originInfoId,
  setUITypeId,
  configProps,
}) {
  const uiTypesState = useUITypes.getState();
  const setConfig = uiTypesState.setOneConfig;
  const setUIType = uiTypesState.setUIType;

  // If it's a preset but we're not "saving as",
  // then use existing non-preset, or copy into a new non-preset ui type.
  let maybeNewUIType = currUIType;
  if (shouldCloneUIType(currUIType, settingPreset)) {
    // Try using existing non-preset (uiType with same originInfoId and type)
    const possibleMatch = existingNonPresetMatchingType(
      uiTypesState.x,
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
  const _isSeriesElement = isSeriesElement(uiType.config.subType);
  return isPresetNotSettingPreset || _isSeriesElement;
}

function setChildUITypeConfig(uiType, props, setConfig) {
  const { childUITypeId } = uiType.config;
  if (childUITypeId) {
    setConfig({ uiTypeId: childUITypeId, ...props });
  }
}
