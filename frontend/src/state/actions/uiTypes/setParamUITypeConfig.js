import C from "constants/constants.json";
import { cloneNewUIType } from "state/actions/uiTypes/cloneUITypes";
import { useSectionInfos } from "state/definitions";
import { getSectionInfo } from "state/getters/sectionInfo";
import { getValueForUIType } from "utils/objs/ev";
import { setEnteredValue } from "../sectionVariants";
import { maybeCloneUIType } from "./cloneUITypes";
import { setParamUITypeId } from "./setParamUITypeId";
import { getParamUIType, setNonPresetUITypeIds } from "./uiTypeCols";
import { addUIType, setOneUITypeConfig } from "./uiTypes";

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
  setOneUITypeConfig({ uiTypeId: uiType.id, ...configProps });
  updateEVs(uiType.id, configProps.configName);
}

function maybeCloneParamUIType({ sectionId, paramInfoId, settingPreset }) {
  const defaultName = useSectionInfos.getState().codeInfo[paramInfoId].name;
  const { uiTypeColId } = getSectionInfo(sectionId);
  const nonPresetUITypeIds =
    useSectionInfos.getState().uiTypeCols[uiTypeColId][paramInfoId]
      .nonPresetUITypeIds;
  const currUIType = getParamUIType(sectionId, paramInfoId);

  const setUITypeId = (uiTypeId) =>
    setParamUITypeId({ uiTypeId, sectionId, paramInfoId });
  const createNonPreset = () =>
    createNonPresetForParam({
      uiTypeColId,
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
  uiTypeColId,
  paramInfoId,
  currUIType,
  defaultName,
}) {
  const newUIType = cloneNewUIType({
    uiType: currUIType,
    name: defaultName,
  });
  addUIType(newUIType);

  setNonPresetUITypeIds({
    collectionId: uiTypeColId,
    paramInfoId,
    newValueFn: (v) => [...v, newUIType.id],
  });
  return newUIType;
}

function updateEVs(uiTypeId, configName) {
  const uiType = useSectionInfos.getState().uiTypes[uiTypeId];
  if (uiType.type === C.SLIDER && ["min", "max"].includes(configName)) {
    _updateEVs(uiType);
  }
}

function _updateEVs(uiType) {
  const { variants, uiTypeCols } = useSectionInfos.getState();
  for (const [colId, col] of Object.entries(uiTypeCols)) {
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
        const variantId = s.variantId;
        for (const [pid, valueInfo] of Object.entries(
          variants[variantId].values,
        )) {
          if (paramsWithUITypeId.has(pid)) {
            const newVal = getValueForUIType({
              uiType,
              currValue: valueInfo.value,
            });
            if (newVal !== valueInfo.value) {
              setEnteredValue({
                collectionId: variantId,
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
