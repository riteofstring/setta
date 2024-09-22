import C from "constants/constants.json";
import { cloneNewUIType } from "state/actions/uiTypes/cloneUITypes";
import {
  useCodeInfo,
  useSectionInfos,
  useSectionVariants,
  useUITypeCols,
  useUITypes,
} from "state/definitions";
import {
  getMappedSectionDBSource,
  getSectionInfo,
} from "state/getters/sectionInfo";
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
  const defaultName = useCodeInfo.getState().x[paramInfoId].name;
  const { uiTypeColId } = getSectionInfo(sectionId);
  const nonPresetUITypeIds =
    useUITypeCols.getState().y[uiTypeColId][paramInfoId].nonPresetUITypeIds;
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
  addUIType({ uiType: newUIType });

  setNonPresetUITypeIds({
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
  const eState = useSectionVariants.getState();
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
        const variantId = s.variantId;
        for (const [pid, valueInfo] of Object.entries(
          eState.x[dbSource][variantId].values,
        )) {
          if (paramsWithUITypeId.has(pid)) {
            const newVal = getValueForUIType({
              uiType,
              currValue: valueInfo.value,
            });
            if (newVal !== valueInfo.value) {
              setEnteredValue({
                dbSource,
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
