import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import {
  getMappedSectionDBSource,
  getSectionInfo,
} from "thunks/sections/getters";
import { cloneNewUIType } from "thunks/uiTypes/cloneUITypes";
import { C } from "utils/constants";
import { getValueForUIType } from "z_utils/objs/ev";
import { getParamUIType } from "../paramInfos";
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
  const defaultName = useCodeInfo.getState().x[paramInfoId].name;
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
  if (uiType.type === C.SLIDER && ["min", "max"].includes(configName)) {
    _updateEVs(uiType);
  }
}

function _updateEVs(uiType) {
  const pState = useParamInfos.getState();
  for (const [colId, col] of Object.entries(pState.y)) {
    const paramsWithUITypeId = new Set();
    for (const [pid, p] of Object.entries(col)) {
      if (p.uiTypeId === uiType.id) {
        paramsWithUITypeId.add(pid);
      }
    }
    if (paramsWithUITypeId.size === 0) {
      continue;
    }

    for (const s of Object.values(useSectionInfos.getState().x)) {
      if (s.uiTypeColId === colId) {
        const dbSource = getMappedSectionDBSource(s.id);
        for (const [pid, currValue] of Object.entries(
          pState.x[s.evColId].values,
        )) {
          if (paramsWithUITypeId.has(pid)) {
            const newVal = getValueForUIType({ uiType, currValue });
            if (newVal !== currValue) {
              pState.setEnteredValue({
                dbSource,
                collectionId: s.evColId,
                paramInfoId: pid,
                value: newVal,
              });
            }
          }
        }
      }
    }
  }
}
