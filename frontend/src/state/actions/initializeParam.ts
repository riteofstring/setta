import _ from "lodash";
import { useCodeInfo } from "state/definitions/codeInfo";
import { useEVCols } from "state/definitions/evCols";
import { useUITypeCols } from "state/definitions/uiTypeCols";
import { useUITypes } from "state/definitions/uiTypes";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { findAllParameters } from "z_utils/getDescendants";
import { CodeInfoType, ManyCodeInfoType } from "z_utils/types/codeInfo";
import { UITypeType } from "z_utils/types/uiType";
import { UITypeColType } from "z_utils/types/uiTypeCol";
import { ManyOf } from "z_utils/types/utils";
import {
  getMappedSectionDBSource,
  getSectionInfo,
} from "../getters/sectionInfo";
import { initManyEnteredValues } from "./evCols";

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
  const evCol = useEVCols.getState().x[dbSource][evColId];
  const paramIdToEv = _.mapValues(paramInfos, (v) => evCol.values[v.id]);

  const uiTypeState = useUITypes.getState();
  const paramIdsToUITypes: ManyOf<UITypeType> = {};
  for (const [paramId, ev] of Object.entries(paramIdToEv)) {
    if (_.isNil(ev)) {
      paramIdsToUITypes[paramId] = uiTypeState.x[paramIdToUITypeId[paramId]];
    }
  }

  initManyEnteredValues({
    dbSource: getMappedSectionDBSource(sectionId),
    collectionId: evColId,
    paramIdsToUITypes,
  });
}

function getParamUITypeIds(sectionId: string, paramInfos: ManyCodeInfoType) {
  const { uiTypeColId } = getSectionInfo(sectionId);
  const uiTypeCol = useUITypeCols.getState().y[uiTypeColId];
  return {
    paramIdToUITypeId: _.mapValues(
      paramInfos,
      (v) => uiTypeCol[v.id]?.uiTypeId,
    ),
    uiTypeColId,
  };
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

  const newIds: UITypeColType = {};
  for (const [paramId, uiTypeId] of Object.entries(paramIdToUITypeId)) {
    if (!uiTypeId) {
      let newId: string;
      if (paramId in inputParamIdToUITypeId) {
        newId = inputParamIdToUITypeId[paramId];
      } else {
        newId = BASE_UI_TYPE_IDS.TEXT;
      }
      newIds[paramId] = { uiTypeId: newId, nonPresetUITypeIds: [] };
      paramIdToUITypeId[paramId] = newId;
    }
  }

  useUITypeCols.getState().setManyUITypeIds({
    collectionId: uiTypeColId,
    paramIdToUITypeId: newIds,
  });

  return paramIdToUITypeId;
}
