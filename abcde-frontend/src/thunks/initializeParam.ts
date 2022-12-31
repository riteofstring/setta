import { DEFAULT_BASE_UI_TYPE_ID } from "abcde-utils/src/constants";
import { CodeInfoType, ManyCodeInfoType } from "abcde-utils/src/types/codeInfo";
import { ManyOf } from "abcde-utils/src/types/utils";
import { createNewId } from "abcde-utils/src/utils";
import _ from "lodash";
import { useProjectConfigCodeInfoMaps } from "models/codeInfoMaps/projectConfigCodeInfoMaps";
import { useUserCodeInfoMaps } from "models/codeInfoMaps/userCodeInfoMaps";
import { useEnteredValues } from "models/info/enteredValues";
import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
import { requiresNestedSection } from "utils/constants";
import { addChild } from "./addChild";
import { getSectionConfig, getSectionTypeConfig } from "./sections";

export function initializeParam(sectionId: string, paramInfos: CodeInfoType[]) {
  const paramInfosAsObj = _.keyBy(paramInfos, "id");
  const paramIdToEvId = initializeParamEnteredValue(sectionId, paramInfosAsObj);
  const paramIdToUITypeId = initializeParamUIType(sectionId, paramInfosAsObj);
  initializeChild(sectionId, paramInfosAsObj, paramIdToUITypeId, paramIdToEvId);
}

function getEnteredValueIds(sectionId: string, paramInfos: ManyCodeInfoType) {
  const { evColId } = getSectionConfig(sectionId);
  const evCol = useParamInfos.getState().x[evColId];
  return {
    paramIdToEvId: _.mapValues(paramInfos, (v) => evCol[v.id]),
    evColId,
  };
}

function initializeParamEnteredValue(
  sectionId: string,
  paramInfos: ManyCodeInfoType
) {
  const { paramIdToEvId, evColId } = getEnteredValueIds(sectionId, paramInfos);

  const newIds: ManyOf<string> = {};
  for (const [paramId, evId] of Object.entries(paramIdToEvId)) {
    if (!evId) {
      const newId = createNewId();
      newIds[paramId] = newId;
      paramIdToEvId[paramId] = newId;
    }
  }
  useParamInfos.getState().setManyEnteredValueIds({
    collectionId: evColId,
    paramIdToEvId: newIds,
  });
  useEnteredValues
    .getState()
    .initManyEnteredValues({ enteredValueIds: Object.values(newIds) });

  return paramIdToEvId;
}

function getParamUITypeIds(sectionId: string, paramInfos: ManyCodeInfoType) {
  const { uiTypeColId } = getSectionTypeConfig(sectionId);
  const uiTypeCol = useParamInfos.getState().y[uiTypeColId];
  return {
    paramIdToUITypeId: _.mapValues(paramInfos, (v) => uiTypeCol[v.id]),
    uiTypeColId,
  };
}

function initializeParamUIType(
  sectionId: string,
  paramInfos: ManyCodeInfoType
) {
  const { paramIdToUITypeId, uiTypeColId } = getParamUITypeIds(
    sectionId,
    paramInfos
  );

  const uiTypesState = useUITypes.getState();
  const pCodeMaps = useProjectConfigCodeInfoMaps.getState();
  const userCodeMaps = useUserCodeInfoMaps.getState();

  const newIds: ManyOf<string> = {};
  for (const [paramId, uiTypeId] of Object.entries(paramIdToUITypeId)) {
    if (!uiTypeId) {
      // TODO: need to do both codeMap and codeTypeMap for both project config and user
      const projectDefaultUITypeId = pCodeMaps.codeInfoMaps[paramId]?.uiTypeId;
      const projectDefaultUIType = uiTypesState.x[projectDefaultUITypeId];

      const globalDefaultUITypeId =
        userCodeMaps.codeInfoTypeMaps[paramInfos[paramId].type]?.uiTypeId;
      const globalDefaultUIType = uiTypesState.x[globalDefaultUITypeId];

      let newId: string;
      if (projectDefaultUIType) {
        newId = projectDefaultUIType.id;
      } else if (globalDefaultUIType) {
        newId = globalDefaultUIType.id;
      } else {
        newId = DEFAULT_BASE_UI_TYPE_ID;
      }
      newIds[paramId] = newId;
      paramIdToUITypeId[paramId] = newId;
    }
  }

  useParamInfos.getState().setManyUITypeIds({
    collectionId: uiTypeColId,
    paramIdToUITypeId: newIds,
  });

  return paramIdToUITypeId;
}

function getChildIds(paramIdToEvId) {
  const evState = useEnteredValues.getState();
  return _.mapValues(paramIdToEvId, (v) => evState.x[v].childId);
}

export function initializeChild(
  sectionId: string,
  paramInfos: ManyCodeInfoType,
  paramIdToUITypeId: { [id: string]: string },
  paramIdToEvId: { [id: string]: string }
) {
  const uiTypesState = useUITypes.getState();
  const paramIdToChildId = getChildIds(paramIdToEvId);
  const newUITypeIds: ManyOf<string> = {};

  for (const [paramId, uiTypeId] of Object.entries(paramIdToUITypeId)) {
    const uiType = uiTypesState.x[uiTypeId];
    if (requiresNestedSection(uiType.type)) {
      if (!paramIdToChildId[paramId]) {
        newUITypeIds[paramId] = uiTypeId;
      }
    }
  }

  // TODO: create a new function 'addChildren' to avoid this loop
  for (const [paramId, uiTypeId] of Object.entries(newUITypeIds)) {
    paramIdToChildId[paramId] = addChild({
      parentId: sectionId,
      name: paramInfos[paramId].name,
      uiTypeId,
      parentParamInfoId: paramInfos[paramId].id,
    })[0];
  }

  return { paramIdToChildId, newUITypeIds };
}
