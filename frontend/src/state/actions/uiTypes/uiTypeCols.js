import C from "constants/constants.json";
import _ from "lodash";
import { useUITypeCols, useUITypes } from "state/definitions";
import { initValue } from "state/utils";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { getSectionInfo } from "../../getters/sectionInfo";

export function setAllUITypeCols({ uiTypeCols }) {
  useUITypeCols.setState({ y: uiTypeCols });
}

export function initManyUITypeColIds({ collectionIds }) {
  useUITypeCols.setState((state) => {
    _.forEach(collectionIds, (id) => initValue(state.y, id, {}));
  });
}

export function setManyParamUITypeIds({ collectionId, paramIdToUITypeId }) {
  useUITypeCols.setState((state) => {
    state.y[collectionId] = {
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
  useUITypeCols.setState((state) => {
    state.y[collectionId][paramInfoId].nonPresetUITypeIds = newValueFn(
      state.y[collectionId][paramInfoId].nonPresetUITypeIds,
    );
  });
}

export function deleteParamInfoFromUITypeCol({ uiTypeColId, ids }) {
  useUITypeCols.setState((state) => {
    state.y[uiTypeColId] = _.omit(state.y[uiTypeColId], ids);
  });
}

export function updateUITypeCols({ uiTypeCols }) {
  useUITypeCols.setState((state) => {
    state.y = { ...state.y, ...uiTypeCols };
  });
}

function getParamUITypeId(sectionId, paramInfoId) {
  const { uiTypeColId } = getSectionInfo(sectionId);
  const uiTypeCol = useUITypeCols.getState().y[uiTypeColId];
  if (paramInfoId.startsWith(C.JSON_SOURCE_PREFIX)) {
    return BASE_UI_TYPE_IDS[C.ONE_LINE_CODE];
  }
  return uiTypeCol[paramInfoId].uiTypeId;
}

export function getParamUIType(sectionId, paramInfoId) {
  const uiTypeId = getParamUITypeId(sectionId, paramInfoId);
  return useUITypes.getState().x[uiTypeId];
}
