import _ from "lodash";
import { useProjectConfigCodeInfoMaps } from "models/codeInfoMaps/projectConfigCodeInfoMaps";
import { useUserCodeInfoMaps } from "models/codeInfoMaps/userCodeInfoMaps";
import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
import {
  DEFAULT_BASE_UI_TYPE_ID,
  requiresNestedSection,
} from "z_utils/constants";
import { findAllParameters } from "z_utils/getDescendants";
import { CodeInfoType, ManyCodeInfoType } from "z_utils/types/codeInfo";
import { UITypeType } from "z_utils/types/uiType";
import { UITypeColType } from "z_utils/types/uiTypeCol";
import { ManyOf } from "z_utils/types/utils";
import { getParamChildId } from "./paramInfos";
import { addChildForParam } from "./sections/addChild";
import { getSectionInfo } from "./sections/getters";

export function initializeChildParams(
  sectionIds: string[],
  codeInfoIds: string[],
  childFinder = findAllParameters
) {
  const params = childFinder(useCodeInfo.getState().x, codeInfoIds);
  for (const s of sectionIds) {
    initializeParam(s, params);
  }
}

export function initializeParam(sectionId: string, paramInfos: CodeInfoType[]) {
  const paramInfosAsObj = _.keyBy(paramInfos, "id");
  const paramIdToUITypeId = initializeParamUIType(sectionId, paramInfosAsObj);
  initializeParamEnteredValue(sectionId, paramInfosAsObj, paramIdToUITypeId);
  initializeChild(sectionId, paramInfosAsObj, paramIdToUITypeId);
}

function initializeParamEnteredValue(
  sectionId: string,
  paramInfos: ManyCodeInfoType,
  paramIdToUITypeId: { [id: string]: string }
) {
  const { evColId } = getSectionInfo(sectionId);
  const evCol = useParamInfos.getState().x[evColId];
  const paramIdToEv = _.mapValues(paramInfos, (v) => evCol[v.id]);

  const uiTypeState = useUITypes.getState();
  const paramIdsToUITypes: ManyOf<UITypeType> = {};
  for (const [paramId, ev] of Object.entries(paramIdToEv)) {
    if (_.isNil(ev)) {
      paramIdsToUITypes[paramId] = uiTypeState.x[paramIdToUITypeId[paramId]];
    }
  }

  useParamInfos.getState().initManyEnteredValues({
    collectionId: evColId,
    paramIdsToUITypes,
  });
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

function getDefaultUIType({ mapState, paramInfo, uiTypesState }) {
  // TODO, should paramInfo have "type"? Currently it doesn't.
  const defaultUITypeId = _.defaultTo(
    mapState.x[paramInfo.name]?.uiTypeId,
    mapState.x[paramInfo.type]?.uiTypeId
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
      const paramInfo = paramInfos[paramId];
      const projectDefaultUIType = getDefaultUIType({
        mapState: pCodeMaps,
        paramInfo,
        uiTypesState,
      });

      const userDefaultUIType = getDefaultUIType({
        mapState: userCodeMaps,
        paramInfo,
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
