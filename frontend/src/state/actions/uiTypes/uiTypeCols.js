import C from "constants/constants.json";
import _ from "lodash";
import { useSectionInfos, useUITypes } from "state/definitions";
import { initValue } from "state/utils";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { getSectionInfo } from "../../getters/sectionInfo";

export function setAllUITypeCols({ uiTypeCols }) {
  useSectionInfos.setState({ uiTypeCols });
}

export function initManyUITypeColIds({ collectionIds }) {
  useSectionInfos.setState((state) => {
    _.forEach(collectionIds, (id) => initValue(state.uiTypeCols, id, {}));
  });
}

export function setManyParamUITypeIds({ collectionId, paramIdToUITypeId }) {
  useSectionInfos.setState((state) => {
    state.uiTypeCols[collectionId] = {
      ...state.y[collectionId],
      ...paramIdToUITypeId,
    };
  });
}

export function setNonPresetUITypeIds({
  collectionId,
  paramInfoId,
  newValueFn,
}) {
  useSectionInfos.setState((state) => {
    state.uiTypeCols[collectionId][paramInfoId].nonPresetUITypeIds = newValueFn(
      state.uiTypeCols[collectionId][paramInfoId].nonPresetUITypeIds,
    );
  });
}

export function deleteParamInfoFromUITypeCol({ uiTypeColId, ids }) {
  useSectionInfos.setState((state) => {
    state.uiTypeCols[uiTypeColId] = _.omit(state.y[uiTypeColId], ids);
  });
}

export function updateUITypeCols({ uiTypeCols }) {
  useSectionInfos.setState((state) => {
    state.uiTypeCols = { ...state.uiTypeCols, ...uiTypeCols };
  });
}

function getParamUITypeId(sectionId, paramInfoId) {
  const { uiTypeColId } = getSectionInfo(sectionId);
  const uiTypeCol = useSectionInfos.getState().uiTypeCols[uiTypeColId];
  if (
    paramInfoId.startsWith(C.JSON_SOURCE_PREFIX) &&
    !(paramInfoId in uiTypeCol)
  ) {
    return BASE_UI_TYPE_IDS[C.TEXT];
  }
  return uiTypeCol[paramInfoId].uiTypeId;
}

export function getParamUIType(sectionId, paramInfoId) {
  const uiTypeId = getParamUITypeId(sectionId, paramInfoId);
  return useUITypes.getState().x[uiTypeId];
}
