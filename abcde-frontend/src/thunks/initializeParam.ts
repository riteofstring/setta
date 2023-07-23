import {
  DEFAULT_BASE_UI_TYPE_ID,
  requiresNestedSection,
} from "abcde-utils/src/constants";
import { findAllParameters } from "abcde-utils/src/getDescendants";
import { CodeInfoType, ManyCodeInfoType } from "abcde-utils/src/types/codeInfo";
import { UITypeColType } from "abcde-utils/src/types/uiTypeCol";
import { ManyOf } from "abcde-utils/src/types/utils";
import { createNewId } from "abcde-utils/src/utils";
import _ from "lodash";
import { useProjectConfigCodeInfoMaps } from "models/codeInfoMaps/projectConfigCodeInfoMaps";
import { useUserCodeInfoMaps } from "models/codeInfoMaps/userCodeInfoMaps";
import { useCodeInfo } from "models/info/codeInfo";
import { useEnteredValues } from "models/info/enteredValues";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { getParamChildId } from "./paramInfos";
import { addChildForParam } from "./sections/addChild";
import { getSectionInfo } from "./sections/sections";

export function initializeParamsOfSectionsWithUITypes(
  uiTypeIds: string[],
  codeInfoIds: string[],
  childFinder = findAllParameters
) {
  if (uiTypeIds.length === 0 || codeInfoIds.length === 0) {
    return;
  }
  for (const s of Object.values(useSectionInfos.getState().x)) {
    if (uiTypeIds.includes(s.uiTypeId)) {
      initializeChildParams(s.id, codeInfoIds, childFinder);
    }
  }
}

export function initializeChildParams(
  sectionId: string,
  codeInfoIds: string[],
  childFinder = findAllParameters
) {
  const params = childFinder(useCodeInfo.getState().allCodeInfo, codeInfoIds);
  initializeParam(sectionId, params);
}

export function initializeParam(sectionId: string, paramInfos: CodeInfoType[]) {
  const paramInfosAsObj = _.keyBy(paramInfos, "id");
  const paramIdToUITypeId = initializeParamUIType(sectionId, paramInfosAsObj);
  initializeParamEnteredValue(sectionId, paramInfosAsObj, paramIdToUITypeId);
  initializeChild(sectionId, paramInfosAsObj, paramIdToUITypeId);
}

function getEnteredValueIds(sectionId: string, paramInfos: ManyCodeInfoType) {
  const { evColId } = getSectionInfo(sectionId);
  const evCol = useParamInfos.getState().x[evColId];
  return {
    paramIdToEvId: _.mapValues(paramInfos, (v) => evCol[v.id]),
    evColId,
  };
}

function initializeParamEnteredValue(
  sectionId: string,
  paramInfos: ManyCodeInfoType,
  paramIdToUITypeId: { [id: string]: string }
) {
  const { paramIdToEvId, evColId } = getEnteredValueIds(sectionId, paramInfos);

  const uiTypeState = useUITypes.getState();
  const newIds: ManyOf<string> = {};
  const newEVToUITypes: ManyOf<string> = {};
  for (const [paramId, evId] of Object.entries(paramIdToEvId)) {
    if (!evId) {
      const newId = createNewId();
      newIds[paramId] = newId;
      newEVToUITypes[newId] = uiTypeState.x[paramIdToUITypeId[paramId]].type;
      paramIdToEvId[paramId] = newId;
    }
  }

  useParamInfos.getState().setManyEnteredValueIds({
    collectionId: evColId,
    paramIdToEvId: newIds,
  });
  useEnteredValues
    .getState()
    .initManyEnteredValues({ evIdsToUITypes: newEVToUITypes });

  return paramIdToEvId;
}

function getParamUITypeIds(sectionId: string, paramInfos: ManyCodeInfoType) {
  const { uiTypeColId } = getSectionInfo(sectionId);
  const uiTypeCol = useParamInfos.getState().y[uiTypeColId];
  return {
    paramIdToUITypeId: _.mapValues(
      paramInfos,
      (v) => uiTypeCol[v.id]?.uiTypeId
    ),
    uiTypeColId,
  };
}

function getDefaultUIType({ mapState, paramInfos, paramId, uiTypesState }) {
  const defaultUITypeId = _.defaultTo(
    mapState.codeInfoMaps[paramId]?.uiTypeId,
    mapState.codeInfoTypeMaps[paramInfos[paramId].type]?.uiTypeId
  );
  return uiTypesState.x[defaultUITypeId];
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

  const newIds: UITypeColType = {};
  for (const [paramId, uiTypeId] of Object.entries(paramIdToUITypeId)) {
    if (!uiTypeId) {
      const projectDefaultUIType = getDefaultUIType({
        mapState: pCodeMaps,
        paramInfos,
        paramId,
        uiTypesState,
      });

      const userDefaultUIType = getDefaultUIType({
        mapState: userCodeMaps,
        paramInfos,
        paramId,
        uiTypesState,
      });

      let newId: string;
      if (projectDefaultUIType) {
        newId = projectDefaultUIType.id;
      } else if (userDefaultUIType) {
        newId = userDefaultUIType.id;
      } else {
        newId = DEFAULT_BASE_UI_TYPE_ID;
      }
      newIds[paramId] = { uiTypeId: newId, nonPresetUITypeIds: [] };
      paramIdToUITypeId[paramId] = newId;
    }
  }

  useParamInfos.getState().setManyUITypeIds({
    collectionId: uiTypeColId,
    paramIdToUITypeId: newIds,
  });

  return paramIdToUITypeId;
}

function getChildIds(sectionId: string, paramInfos: ManyCodeInfoType) {
  return _.mapValues(paramInfos, (p) => getParamChildId(sectionId, p.id));
}

export function initializeChild(
  sectionId: string,
  paramInfos: ManyCodeInfoType,
  paramIdToUITypeId: { [id: string]: string }
) {
  const uiTypesState = useUITypes.getState();
  const paramIdToChildId = getChildIds(sectionId, paramInfos);
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
    paramIdToChildId[paramId] = addChildForParam({
      parentId: sectionId,
      name: paramInfos[paramId].name,
      uiTypeId,
      paramInfoId: paramInfos[paramId].id,
    });
  }

  return { paramIdToChildId, newUITypeIds };
}
