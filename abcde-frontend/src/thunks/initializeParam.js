import { thunk } from "easy-peasy";
import { useProjectConfigCodeInfoMaps } from "models/codeInfoMaps/projectConfigCodeInfoMaps";
import { useUserCodeInfoMaps } from "models/codeInfoMaps/userCodeInfoMaps";
import { useEnteredValues } from "models/info/enteredValues";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionConfigs } from "models/info/sectionConfigs";
import { useUITypes } from "models/info/uiTypes";
import {
  DEFAULT_BASE_UI_TYPE_ID,
  requiresNestedSection,
} from "utils/constants";
import { createNewId, curryAction } from "utils/utils";

export const initializeParam = thunk((actions, payload, helpers) => {
  const { sectionId, paramInfo } = payload;
  const enteredValueId = initializeParamEnteredValue(
    sectionId,
    paramInfo,
    helpers
  );
  const uiTypeId = initializeParamUIType(sectionId, paramInfo, helpers);
  fnInitializeChild(sectionId, paramInfo, uiTypeId, enteredValueId, helpers);
});

function getEnteredValueId(sectionId, paramInfo, helpers) {
  const s = helpers.getStoreState();
  const configId = s.sectionInfos.x[sectionId].configId;
  const evColId = useSectionConfigs.getState().x[configId].evColId;
  return {
    enteredValueId: useParamInfos.getState().x[evColId]?.[paramInfo.id],
    evColId,
  };
}

function initializeParamEnteredValue(sectionId, paramInfo, helpers) {
  let { enteredValueId, evColId } = getEnteredValueId(
    sectionId,
    paramInfo,
    helpers
  );

  if (!enteredValueId) {
    const setEnteredValueId = curryAction(
      useParamInfos.getState().setEnteredValueId,
      {
        collectionId: evColId,
        paramInfoId: paramInfo.id,
      },
      "enteredValueId"
    );

    enteredValueId = createNewId();

    setEnteredValueId(enteredValueId);
    useEnteredValues
      .getState()
      .setEnteredValue({ enteredValueId, value: null });
  }

  return enteredValueId;
}

function initializeParamUIType(sectionId, paramInfo, helpers) {
  const s = helpers.getStoreState();
  const uiTypesState = useUITypes.getState();
  const configId = s.sectionInfos.x[sectionId].configId;
  const sectionTypeId = useSectionConfigs.getState().x[configId].uiTypeId;
  const uiTypeColId = uiTypesState.x[sectionTypeId].config.uiTypeColId;
  let uiTypeId = useParamInfos.getState().y[uiTypeColId]?.[paramInfo.id];

  if (!uiTypeId) {
    const projectDefaultUITypeId =
      useProjectConfigCodeInfoMaps.getState().codeInfoMaps[paramInfo.id]
        ?.uiTypeId;
    const projectDefaultUIType = uiTypesState.x[projectDefaultUITypeId];

    const globalDefaultUITypeId =
      useUserCodeInfoMaps.getState().codeInfoTypeMaps[paramInfo.type]?.uiTypeId;
    const globalDefaultUIType = uiTypesState.x[globalDefaultUITypeId];

    const setUITypeId = curryAction(
      useParamInfos.getState().setUITypeId,
      {
        collectionId: uiTypeColId,
        paramInfoId: paramInfo.id,
      },
      "uiTypeId"
    );

    if (projectDefaultUIType) {
      uiTypeId = projectDefaultUIType.id;
    } else if (globalDefaultUIType) {
      uiTypeId = globalDefaultUIType.id;
    } else {
      uiTypeId = DEFAULT_BASE_UI_TYPE_ID;
    }

    setUITypeId(uiTypeId);
  }
  return uiTypeId;
}

function fnInitializeChild(
  sectionId,
  paramInfo,
  uiTypeId,
  enteredValueId,
  helpers
) {
  const uiType = useUITypes.getState().x[uiTypeId];
  if (!requiresNestedSection(uiType.type)) {
    return;
  }
  const childId = useEnteredValues.getState().x[enteredValueId].childId;
  if (!childId) {
    helpers.getStoreActions().thunks.addChild({
      parentId: sectionId,
      name: paramInfo.name,
      uiTypeId,
      parentParamInfoId: paramInfo.id,
    });
  }
}

export const initializeChild = thunk((actions, payload, helpers) => {
  const { sectionId, paramInfo, uiTypeId } = payload;
  const { enteredValueId } = getEnteredValueId(sectionId, paramInfo, helpers);
  fnInitializeChild(sectionId, paramInfo, uiTypeId, enteredValueId, helpers);
});
