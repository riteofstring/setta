import _ from "lodash";
import { useProjectConfigCodeInfoMaps } from "models/codeInfoMaps/projectConfigCodeInfoMaps";
import { useUserCodeInfoMaps } from "models/codeInfoMaps/userCodeInfoMaps";
import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useUITypes } from "models/info/uiTypes";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { findAllParameters } from "z_utils/getDescendants";
import { CodeInfoType, ManyCodeInfoType } from "z_utils/types/codeInfo";
import { UITypeType } from "z_utils/types/uiType";
import { UITypeColType } from "z_utils/types/uiTypeCol";
import { ManyOf } from "z_utils/types/utils";
import {
  getMappedSectionDBSource,
  getSectionInfo,
} from "../state/sectionInfos/getters";

export function initializeChildParams({
  sectionIds,
  codeInfoIds,
  childFinder = findAllParameters,
  inputParamIdToUITypeId = {},
}: {
  sectionIds: string[];
  codeInfoIds: string[];
  childFinder: any;
  inputParamIdToUITypeId: any;
}) {
  console.log("initializeChildParams");
  const params = childFinder(useCodeInfo.getState().x, codeInfoIds);
  for (const s of sectionIds) {
    initializeParam(s, params, inputParamIdToUITypeId);
  }
}

export function initializeParam(
  sectionId: string,
  paramInfos: CodeInfoType[],
  inputParamIdToUITypeId = {},
) {
  const paramInfosAsObj = _.keyBy(paramInfos, "id");
  const paramIdToUITypeId = initializeParamUIType(
    sectionId,
    paramInfosAsObj,
    inputParamIdToUITypeId,
  );
  initializeParamEnteredValue(sectionId, paramInfosAsObj, paramIdToUITypeId);
}

function initializeParamEnteredValue(
  sectionId: string,
  paramInfos: ManyCodeInfoType,
  paramIdToUITypeId: { [id: string]: string },
) {
  const { evColId } = getSectionInfo(sectionId);
  const dbSource = getMappedSectionDBSource(sectionId);
  const evCol = useParamInfos.getState().x[dbSource][evColId];
  const paramIdToEv = _.mapValues(paramInfos, (v) => evCol.values[v.id]);

  const uiTypeState = useUITypes.getState();
  const paramIdsToUITypes: ManyOf<UITypeType> = {};
  for (const [paramId, ev] of Object.entries(paramIdToEv)) {
    if (_.isNil(ev)) {
      paramIdsToUITypes[paramId] = uiTypeState.x[paramIdToUITypeId[paramId]];
    }
  }

  useParamInfos.getState().initManyEnteredValues({
    dbSource: getMappedSectionDBSource(sectionId),
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
      (v) => uiTypeCol[v.id]?.uiTypeId,
    ),
    uiTypeColId,
  };
}

function getDefaultUIType({ mapState, paramInfo, uiTypesState }) {
  // TODO, should paramInfo have "type"? Currently it doesn't.
  const defaultUITypeId = _.defaultTo(
    mapState.x[paramInfo.name]?.uiTypeId,
    mapState.x[paramInfo.type]?.uiTypeId,
  );
  return uiTypesState.x[defaultUITypeId];
}

function initializeParamUIType(
  sectionId: string,
  paramInfos: ManyCodeInfoType,
  inputParamIdToUITypeId = {},
) {
  const { paramIdToUITypeId, uiTypeColId } = getParamUITypeIds(
    sectionId,
    paramInfos,
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
      if (paramId in inputParamIdToUITypeId) {
        newId = inputParamIdToUITypeId[paramId];
      } else if (projectDefaultUIType) {
        newId = projectDefaultUIType.id;
      } else if (userDefaultUIType) {
        newId = userDefaultUIType.id;
      } else {
        newId = BASE_UI_TYPE_IDS.TEXT;
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
