import { thunk } from "easy-peasy";
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
  const evColId = s.sectionConfigs.x[configId].evColId;
  return { enteredValueId: s.paramInfos.x[evColId]?.[paramInfo.id], evColId };
}

function initializeParamEnteredValue(sectionId, paramInfo, helpers) {
  let { enteredValueId, evColId } = getEnteredValueId(
    sectionId,
    paramInfo,
    helpers
  );

  if (!enteredValueId) {
    const a = helpers.getStoreActions();

    const setEnteredValueId = curryAction(
      a.paramInfos.setEnteredValueId,
      {
        collectionId: evColId,
        paramInfoId: paramInfo.id,
      },
      "enteredValueId"
    );

    enteredValueId = createNewId();

    setEnteredValueId(enteredValueId);
    a.enteredValues.setEnteredValue({ enteredValueId, value: null });
  }

  return enteredValueId;
}

function initializeParamUIType(sectionId, paramInfo, helpers) {
  const s = helpers.getStoreState();
  const configId = s.sectionInfos.x[sectionId].configId;
  const sectionTypeId = s.sectionConfigs.x[configId].uiTypeId;
  const uiTypeColId = s.uiTypes.x[sectionTypeId].config.uiTypeColId;
  let uiTypeId = s.paramInfos.y[uiTypeColId]?.[paramInfo.id];

  if (!uiTypeId) {
    const projectDefaultUITypeId =
      s.projectParamDefaults.x[paramInfo.id]?.uiTypeId;
    const projectDefaultUIType = s.uiTypes.x[projectDefaultUITypeId];

    const globalDefaultUITypeId =
      s.globalParamDefaults.x[paramInfo.type]?.uiTypeId;
    const globalDefaultUIType = s.uiTypes.x[globalDefaultUITypeId];

    const setUITypeId = curryAction(
      helpers.getStoreActions().paramInfos.setUITypeId,
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
  const s = helpers.getStoreState();
  const uiType = s.uiTypes.x[uiTypeId];
  if (!requiresNestedSection(uiType.type)) {
    return;
  }
  const childId = s.enteredValues.x[enteredValueId].childId;
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
