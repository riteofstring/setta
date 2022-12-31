import { DEFAULT_BASE_UI_TYPE_ID } from "abcde-utils/src/constants";
import { createNewId } from "abcde-utils/src/utils";
import { useProjectConfigCodeInfoMaps } from "models/codeInfoMaps/projectConfigCodeInfoMaps";
import { useUserCodeInfoMaps } from "models/codeInfoMaps/userCodeInfoMaps";
import { useEnteredValues } from "models/info/enteredValues";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionConfigs } from "models/info/sectionConfigs";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { requiresNestedSection } from "utils/constants";
import { addChild } from "./addChild";
import { getSectionTypeConfig } from "./sections";

export function initializeParam({ sectionId, paramInfo }) {
  const enteredValueId = initializeParamEnteredValue(sectionId, paramInfo);
  const uiTypeId = initializeParamUIType(sectionId, paramInfo);
  fnInitializeChild(sectionId, paramInfo, uiTypeId, enteredValueId);
}

function getEnteredValueId(sectionId, paramInfo) {
  const configId = useSectionInfos.getState().x[sectionId].configId;
  const evColId = useSectionConfigs.getState().x[configId].evColId;
  return {
    enteredValueId: useParamInfos.getState().x[evColId]?.[paramInfo.id],
    evColId,
  };
}

function initializeParamEnteredValue(sectionId, paramInfo) {
  let { enteredValueId, evColId } = getEnteredValueId(sectionId, paramInfo);

  if (!enteredValueId) {
    enteredValueId = createNewId();
    useParamInfos.getState().setEnteredValueId({
      collectionId: evColId,
      paramInfoId: paramInfo.id,
      enteredValueId,
    });
    useEnteredValues
      .getState()
      .setEnteredValue({ enteredValueId, value: null });
  }

  return enteredValueId;
}

function initializeParamUIType(sectionId, paramInfo) {
  const uiTypesState = useUITypes.getState();
  const { uiTypeColId } = getSectionTypeConfig(sectionId);
  let uiTypeId = useParamInfos.getState().y[uiTypeColId]?.[paramInfo.id];

  if (!uiTypeId) {
    const projectDefaultUITypeId =
      useProjectConfigCodeInfoMaps.getState().codeInfoMaps[paramInfo.id]
        ?.uiTypeId;
    const projectDefaultUIType = uiTypesState.x[projectDefaultUITypeId];

    const globalDefaultUITypeId =
      useUserCodeInfoMaps.getState().codeInfoTypeMaps[paramInfo.type]?.uiTypeId;
    const globalDefaultUIType = uiTypesState.x[globalDefaultUITypeId];

    if (projectDefaultUIType) {
      uiTypeId = projectDefaultUIType.id;
    } else if (globalDefaultUIType) {
      uiTypeId = globalDefaultUIType.id;
    } else {
      uiTypeId = DEFAULT_BASE_UI_TYPE_ID;
    }

    useParamInfos.getState().setUITypeId({
      collectionId: uiTypeColId,
      paramInfoId: paramInfo.id,
      uiTypeId,
    });
  }
  return uiTypeId;
}

function fnInitializeChild(sectionId, paramInfo, uiTypeId, enteredValueId) {
  const uiType = useUITypes.getState().x[uiTypeId];
  if (!requiresNestedSection(uiType.type)) {
    return;
  }
  const childId = useEnteredValues.getState().x[enteredValueId].childId;
  if (!childId) {
    addChild({
      parentId: sectionId,
      name: paramInfo.name,
      uiTypeId,
      parentParamInfoId: paramInfo.id,
    });
  }
}

export function initializeChild({ sectionId, paramInfo, uiTypeId }) {
  const { enteredValueId } = getEnteredValueId(sectionId, paramInfo);
  fnInitializeChild(sectionId, paramInfo, uiTypeId, enteredValueId);
}
