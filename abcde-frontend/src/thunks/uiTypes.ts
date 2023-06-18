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
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import {
  getSectionInfo,
  getSectionType,
  getSectionTypeConfig,
  setSectionInfoAttr,
  setSelectedItem,
} from "thunks/sections/sections";
import { requiresNestedSection } from "utils/constants";
import {
  cloneNewUIType,
  createParamOriginInfoId,
  createSectionOriginInfoId,
} from "utils/uiTypeUtils";
import { initializeChild } from "./initializeParam";
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
    let { userSpecifiedObjectId } = getSectionTypeConfig(sectionId);
    if (!userSpecifiedObjectId) {
      const newObj = newCodeInfo({
        rcType: RCType.CALLABLE,
      });
      userSpecifiedObjectId = newObj.id;
      useCodeInfo
        .getState()
        .updateInfos({ allCodeInfo: { [newObj.id]: newObj } });
    }
    setSelectedItem(sectionId, userSpecifiedObjectId, false);
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
  const {
    name: defaultName,
    parentId,
    paramInfoId,
  } = useSectionInfos.getState().x[sectionId];
  const currUIType = getSectionType(sectionId);

  const originInfoId = paramInfoId
    ? createParamOriginInfoId(getSectionInfo(parentId).uiTypeColId, paramInfoId)
    : createSectionOriginInfoId(sectionId);

  const setUITypeId = (uiTypeId) => setSectionUITypeId({ uiTypeId, sectionId });

  setUITypeConfigAndMaybeClone({
    defaultName,
    currUIType,
    settingPreset,
    originInfoId,
    setUITypeId,
    configProps,
  });

  maybeIncrementProjectStateVersion(incrementVersion);
}

export function setParamUITypeConfig({
  sectionId,
  paramInfoId,
  settingPreset = false,
  configProps,
}) {
  const defaultName = useCodeInfo.getState().allCodeInfo[paramInfoId].name;
  const uiTypeColId = getSectionInfo(sectionId).uiTypeColId;
  const currUIType = getParamUIType(sectionId, paramInfoId);

  const originInfoId = createParamOriginInfoId(uiTypeColId, paramInfoId);
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
