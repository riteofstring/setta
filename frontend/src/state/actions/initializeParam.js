import _ from "lodash";
import { useCodeInfo, useSectionInfos } from "state/definitions";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { findAllParameters } from "utils/getDescendants";
import { getSectionInfo } from "../getters/sectionInfo";
import { getSectionCodeInfoChildren } from "./codeInfoCols";
import { initManyEnteredValues } from "./sectionVariants";
import { setManyParamUITypeIds } from "./uiTypes/uiTypeCols";

export function initializeChildParams({
  sectionIds,
  codeInfoIds,
  childFinder = findAllParameters,
  inputParamIdToUITypeId = {},
}) {
  for (const s of sectionIds) {
    const { ids: paramIds } = childFinder(
      useCodeInfo.getState().x,
      getSectionCodeInfoChildren(s),
      codeInfoIds,
    );
    initializeParam(s, paramIds, inputParamIdToUITypeId);
  }
}

export function initializeParam(
  sectionId,
  paramIds,
  inputParamIdToUITypeId = {},
) {
  const paramIdToUITypeId = initializeParamUIType(
    sectionId,
    paramIds,
    inputParamIdToUITypeId,
  );
  initializeParamEnteredValue(sectionId, paramIds, paramIdToUITypeId);
}

function initializeParamEnteredValue(sectionId, paramIds, paramIdToUITypeId) {
  const { variantId } = useSectionInfos.getState().sectionConfigs[sectionId];
  const sectionVariant = useSectionInfos.getState().variants[variantId];
  const uiTypeState = useSectionInfos.getState().uiTypes;
  const paramIdsToUITypes = {};
  for (const paramId of paramIds) {
    const ev = sectionVariant.values[paramId];
    if (_.isNil(ev)) {
      paramIdsToUITypes[paramId] = uiTypeState[paramIdToUITypeId[paramId]];
    }
  }

  initManyEnteredValues({
    collectionId: variantId,
    paramIdsToUITypes,
  });
}

function initializeParamUIType(
  sectionId,
  paramIds,
  inputParamIdToUITypeId = {},
) {
  const { uiTypeColId } = getSectionInfo(sectionId);
  const uiTypeCol = useSectionInfos.getState().uiTypeCols[uiTypeColId];

  const newIds = {};
  const paramIdToUITypeId = {};
  for (const paramId of paramIds) {
    const uiTypeId = uiTypeCol[paramId]?.uiTypeId;
    if (!uiTypeId) {
      let newId;
      if (paramId in inputParamIdToUITypeId) {
        newId = inputParamIdToUITypeId[paramId];
      } else {
        newId = BASE_UI_TYPE_IDS.TEXT;
      }
      newIds[paramId] = { uiTypeId: newId, nonPresetUITypeIds: [] };
      paramIdToUITypeId[paramId] = newId;
    } else {
      paramIdToUITypeId[paramId] = uiTypeId;
    }
  }

  setManyParamUITypeIds({
    collectionId: uiTypeColId,
    paramIdToUITypeId: newIds,
  });

  return paramIdToUITypeId;
}
