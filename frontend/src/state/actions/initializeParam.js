import _ from "lodash";
import {
  useCodeInfo,
  useSectionConfigs,
  useSectionVariants,
  useUITypeCols,
  useUITypes,
} from "state/definitions";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { findAllParameters } from "utils/getDescendants";
import {
  getMappedSectionDBSource,
  getSectionInfo,
} from "../getters/sectionInfo";
import { initManyEnteredValues } from "./sectionVariants";
import { setManyParamUITypeIds } from "./uiTypes/uiTypeCols";

export function initializeChildParams({
  sectionIds,
  codeInfoIds,
  childFinder = findAllParameters,
  inputParamIdToUITypeId = {},
}) {
  console.log("initializeChildParams");
  const params = childFinder(useCodeInfo.getState().x, codeInfoIds);
  for (const s of sectionIds) {
    initializeParam(s, params, inputParamIdToUITypeId);
  }
}

export function initializeParam(
  sectionId,
  paramInfos,
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

function initializeParamEnteredValue(sectionId, paramInfos, paramIdToUITypeId) {
  const { variantId } = useSectionConfigs.getState().x[sectionId];
  const dbSource = getMappedSectionDBSource(sectionId);
  const sectionVariant = useSectionVariants.getState().x[dbSource][variantId];
  const paramIdToEv = _.mapValues(
    paramInfos,
    (v) => sectionVariant.values[v.id],
  );

  const uiTypeState = useUITypes.getState();
  const paramIdsToUITypes = {};
  for (const [paramId, ev] of Object.entries(paramIdToEv)) {
    if (_.isNil(ev)) {
      paramIdsToUITypes[paramId] = uiTypeState.x[paramIdToUITypeId[paramId]];
    }
  }

  initManyEnteredValues({
    dbSource: getMappedSectionDBSource(sectionId),
    collectionId: variantId,
    paramIdsToUITypes,
  });
}

function getParamUITypeIds(sectionId, paramInfos) {
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
  sectionId,
  paramInfos,
  inputParamIdToUITypeId = {},
) {
  const { paramIdToUITypeId, uiTypeColId } = getParamUITypeIds(
    sectionId,
    paramInfos,
  );

  const newIds = {};
  for (const [paramId, uiTypeId] of Object.entries(paramIdToUITypeId)) {
    if (!uiTypeId) {
      let newId;
      if (paramId in inputParamIdToUITypeId) {
        newId = inputParamIdToUITypeId[paramId];
      } else {
        newId = BASE_UI_TYPE_IDS.TEXT;
      }
      newIds[paramId] = { uiTypeId: newId, nonPresetUITypeIds: [] };
      paramIdToUITypeId[paramId] = newId;
    }
  }

  setManyParamUITypeIds({
    collectionId: uiTypeColId,
    paramIdToUITypeId: newIds,
  });

  return paramIdToUITypeId;
}
