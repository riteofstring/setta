import {
  isSeriesElement,
  USER_SPECIFIED_OBJECT_UI_TYPE_ID,
} from "abcde-utils/src/constants";
import { newCodeInfo } from "abcde-utils/src/objs/codeInfo";
import { RCType } from "abcde-utils/src/types/codeInfo";
import { isPreset } from "abcde-utils/src/uiTypeConstants";
import { isFromSelfAndMatchesType } from "hooks/usePresetUIType";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
import {
  getSectionInfo,
  getSectionType,
  setSectionInfoAttr,
  setSelectedItem,
} from "thunks/sections/sections";
import { requiresNestedSection } from "utils/constants";
import { createNonPreset } from "utils/uiTypeUtils";
import {
  initializeChild,
  initializeChildParams,
  initializeParamsOfSectionsWithUITypes,
} from "./initializeParam";
import { getParamEVId, getParamUIType } from "./paramInfos";
import { maybeIncrementProjectStateVersion } from "./undo";

export function setSectionUITypeId({
  uiTypeId,
  sectionId,
  incrementVersion = false,
}) {
  const { parentId, paramInfoId } = getSectionInfo(sectionId);

  setSectionInfoAttr({
    sectionId,
    attr: "uiTypeId",
    value: uiTypeId,
  });

  if (paramInfoId) {
    setParamUITypeId({ sectionId: parentId, paramInfoId, uiTypeId });
  }

  if (uiTypeId === USER_SPECIFIED_OBJECT_UI_TYPE_ID) {
    initializeUserSpecifiedObject(sectionId);
  }

  maybeIncrementProjectStateVersion(incrementVersion);
}

export function setParamUITypeId({
  uiTypeId,
  sectionId,
  paramInfoId,
  incrementVersion = false,
}) {
  const { uiTypeColId } = getSectionInfo(sectionId);

  useParamInfos.getState().setUITypeId({
    collectionId: uiTypeColId,
    paramInfoId,
    uiTypeId,
  });

  const isNested = requiresNestedSection(
    useUITypes.getState().x[uiTypeId].type
  );

  if (isNested) {
    const paramInfo = useCodeInfo.getState().allCodeInfo[paramInfoId];
    const evId = getParamEVId(sectionId, paramInfoId);
    const { paramIdToChildId } = initializeChild(
      sectionId,
      { [paramInfoId]: paramInfo },
      { [paramInfoId]: uiTypeId },
      { [paramInfoId]: evId }
    );

    setSectionInfoAttr({
      sectionId: paramIdToChildId[paramInfoId],
      attr: "uiTypeId",
      value: uiTypeId,
    });
  }

  maybeIncrementProjectStateVersion(incrementVersion);
}

export function setSectionUITypeConfig({
  sectionId,
  settingPreset = false,
  configProps,
  incrementVersion = false,
}) {
  const uiType = maybeCloneSectionUIType({ sectionId, settingPreset });
  setConfigAndChildConfig(uiType, configProps);
  maybeIncrementProjectStateVersion(incrementVersion);
}

function maybeCloneSectionUIType({ sectionId, settingPreset }) {
  const { name: defaultName, nonPresetUITypeIds } = getSectionInfo(sectionId);
  const currUIType = getSectionType(sectionId);

  const setUITypeId = (uiTypeId) => setSectionUITypeId({ uiTypeId, sectionId });

  return maybeCloneUIType({
    sectionId,
    defaultName,
    currUIType,
    settingPreset,
    nonPresetUITypeIds,
    setUITypeId,
  });
}

export function setParamUITypeConfig({
  sectionId,
  paramInfoId,
  settingPreset = false,
  configProps,
}) {
  const uiType = maybeCloneParamUIType({
    sectionId,
    paramInfoId,
    settingPreset,
  });
  setConfigAndChildConfig(uiType, configProps);
}

function maybeCloneParamUIType({ sectionId, paramInfoId, settingPreset }) {
  const defaultName = useCodeInfo.getState().allCodeInfo[paramInfoId].name;
  const { nonPresetUITypeIds } = getSectionInfo(sectionId);
  const currUIType = getParamUIType(sectionId, paramInfoId);

  const setUITypeId = (uiTypeId) =>
    setParamUITypeId({ uiTypeId, sectionId, paramInfoId });

  return maybeCloneUIType({
    defaultName,
    currUIType,
    settingPreset,
    nonPresetUITypeIds,
    setUITypeId,
  });
}

function maybeCloneUIType({
  sectionId,
  defaultName,
  currUIType,
  settingPreset,
  nonPresetUITypeIds,
  setUITypeId,
}) {
  // If it's a preset but we're not "saving as",
  // then use existing non-preset, or copy into a new non-preset ui type.
  let maybeNewUIType = currUIType;
  if (shouldCloneUIType(currUIType, settingPreset)) {
    // Try using existing non-preset (uiType with same type and that belongs to section's nonPresetUITypeIds)
    const possibleMatch = existingNonPresetMatchingType(
      useUITypes.getState().x,
      currUIType,
      nonPresetUITypeIds
    );

    // There's no match, so clone the preset into a non-preset
    if (!possibleMatch) {
      maybeNewUIType = createNonPreset({ sectionId, currUIType, defaultName });
    } else {
      maybeNewUIType = possibleMatch;
    }
    // In both cases, make the section or param to use the new or existing id
    setUITypeId(maybeNewUIType.id);
  }

  return maybeNewUIType;
}

function setConfigAndChildConfig(uiType, configProps) {
  useUITypes.getState().setOneConfig({ uiTypeId: uiType.id, ...configProps });

  const childUITypeId = uiType.config.childUITypeId;
  // Changing a root config should also change its child config
  if (childUITypeId) {
    useUITypes
      .getState()
      .setOneConfig({ uiTypeId: childUITypeId, ...configProps });
  }
}

function existingNonPresetMatchingType(allUITypes, uiType, nonPresetUITypeIds) {
  const matches = _.filter(allUITypes, (v) =>
    isFromSelfAndMatchesType(v, nonPresetUITypeIds, uiType.type)
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

function initializeUserSpecifiedObject(sectionId) {
  let { userSpecifiedObjectId } = getSectionInfo(sectionId);
  if (!userSpecifiedObjectId) {
    const newObj = newCodeInfo({
      rcType: RCType.CALLABLE,
    });
    userSpecifiedObjectId = newObj.id;
    setSectionInfoAttr({
      sectionId,
      attr: "userSpecifiedObjectId",
      value: userSpecifiedObjectId,
    });
    useCodeInfo
      .getState()
      .updateInfos({ allCodeInfo: { [newObj.id]: newObj } });
  }
  setSelectedItem(sectionId, userSpecifiedObjectId, false);
}

export function setCollections({
  sectionId,
  settingPreset = false,
  id,
  checked,
  newValueFn,
  incrementVersion,
}) {
  const uiType = maybeCloneSectionUIType({ sectionId, settingPreset });

  if (checked) {
    if (uiType.config.childUITypeId) {
      initializeParamsOfSectionsWithUITypes(
        [uiType.id, uiType.config.childUITypeId],
        [id]
      );
    } else {
      initializeChildParams(sectionId, [id]);
    }
  }

  setSectionUITypeConfig({
    sectionId,
    configProps: { configName: "collections", newValueFn },
    incrementVersion,
  });
}
