import C from "constants/constants.json";
import { cloneNewUIType } from "state/actions/cloneUITypes";
import { useCodeInfo } from "state/definitions/codeInfo";
import { useEVCols } from "state/definitions/evCols";
import { useSectionInfos } from "state/definitions/sectionInfos";
import { useUITypeCols } from "state/definitions/uiTypeCols";
import { useUITypes } from "state/definitions/uiTypes";
import {
  getMappedSectionDBSource,
  getSectionInfo,
} from "state/getters/sectionInfo";
import { getValueForUIType } from "z_utils/objs/ev";
import { maybeCloneUIType } from "./cloneUITypes";
import { getParamUIType } from "./paramInfos";
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
  useUITypeCols.getState().setNonPresetUITypeIds({
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
  const uState = useUITypeCols.getState();
  const eState = useEVCols.getState();
  for (const [colId, col] of Object.entries(uState.y)) {
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
          eState.x[s.evColId].values,
        )) {
          if (paramsWithUITypeId.has(pid)) {
            const newVal = getValueForUIType({ uiType, currValue });
            if (newVal !== currValue) {
              eState.setEnteredValue({
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
