import _ from "lodash";
import { useUITypeCols, useUITypes } from "state/definitions";
import { initValue } from "state/utils";
import { getSectionInfo } from "../getters/sectionInfo";

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
  return useUITypeCols.getState().y[uiTypeColId][paramInfoId].uiTypeId;
}

export function getParamUIType(sectionId, paramInfoId) {
  const uiTypeId = getParamUITypeId(sectionId, paramInfoId);
  return useUITypes.getState().x[uiTypeId];
}
