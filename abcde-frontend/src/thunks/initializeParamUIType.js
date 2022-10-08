import { thunk } from "easy-peasy";
import { DEFAULT_BASE_UI_TYPE_ID } from "utils/constants";
import { curryAction } from "utils/utils";

export const initializeParamUIType = thunk((actions, payload, helpers) => {
  const { sectionId, paramInfo } = payload;
  const s = helpers.getStoreState();
  const configId = s.sectionInfos.x[sectionId].configId;
  const sectionTypeId = s.sectionConfigs.x[configId].uiTypeId;
  const uiTypeColId = s.uiTypes.x[sectionTypeId].config.uiTypeColId;
  const uiTypeId = s.paramInfos.y[uiTypeColId]?.[paramInfo.id];

  if (uiTypeId) {
    return;
  }

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
    setUITypeId(projectDefaultUIType.id);
  } else if (globalDefaultUIType) {
    setUITypeId(globalDefaultUIType.id);
  } else {
    setUITypeId(DEFAULT_BASE_UI_TYPE_ID);
  }
});
