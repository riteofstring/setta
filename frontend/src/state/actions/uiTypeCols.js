import _ from "lodash";
import { useUITypeCols } from "state/definitions";
import { initValue } from "state/definitions/utils";

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
