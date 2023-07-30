import { SLIDER } from "abcde-utils/src/constants";
import { getValueForUIType } from "abcde-utils/src/objs/ev";
import { useCodeInfo } from "models/info/codeInfo";
import { useEnteredValues } from "models/info/enteredValues";
import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
import { getSectionInfo } from "thunks/sections/getters";
import { cloneNewUIType } from "thunks/uiTypes/cloneUITypes";
import { getAllEVsWithUIType, getParamUIType } from "../paramInfos";
import { maybeCloneUIType } from "./cloneUITypes";
import { setConfigAndChildConfig } from "./setConfigAndChildConfig";
import { setParamUITypeId } from "./setParamUITypeId";

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
  updateEVs(uiType.id, configProps.configName);
}

function maybeCloneParamUIType({ sectionId, paramInfoId, settingPreset }) {
  const defaultName = useCodeInfo.getState().allCodeInfo[paramInfoId].name;
  const { nonPresetUITypeIds } = getSectionInfo(sectionId);
  const currUIType = getParamUIType(sectionId, paramInfoId);

  const setUITypeId = (uiTypeId) =>
    setParamUITypeId({ uiTypeId, sectionId, paramInfoId });
  const createNonPreset = () =>
    createNonPresetForParam({
      sectionId,
      paramInfoId,
      currUIType,
      defaultName,
    });

  return maybeCloneUIType({
    currUIType,
    settingPreset,
    createNonPreset,
    nonPresetUITypeIds,
    setUITypeId,
  });
}

function createNonPresetForParam({
  sectionId,
  paramInfoId,
  currUIType,
  defaultName,
}) {
  const newUIType = cloneNewUIType({
    uiType: currUIType,
    name: defaultName,
  });
  useUITypes.getState().setUIType({ uiType: newUIType });

  const { uiTypeColId } = getSectionInfo(sectionId);
  useParamInfos.getState().setNonPresetUITypeIds({
    collectionId: uiTypeColId,
    paramInfoId,
    newValueFn: (v) => [...v, newUIType.id],
  });
  return newUIType;
}

function updateEVs(uiTypeId, configName) {
  const uiType = useUITypes.getState().x[uiTypeId];
  if (uiType.type === SLIDER) {
    updateSliderEVs(uiType, configName);
  }
}

function updateSliderEVs(uiType, configName) {
  if (["min", "max"].includes(configName)) {
    const s = useEnteredValues.getState();
    const evsWithUIType = getAllEVsWithUIType(uiType.id);
    for (const id of evsWithUIType) {
      const currValue = s.x[id];
      const newVal = getValueForUIType({ uiType, currValue });
      if (newVal !== currValue) {
        s.setEnteredValue({ enteredValueId: id, value: newVal });
      }
    }
  }
}
