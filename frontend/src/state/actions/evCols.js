import _ from "lodash";
import { useEVCols } from "state/definitions";
import { createRandomName } from "utils/idNameCreation";
import { newEV } from "utils/objs/ev";
import { initValue } from "../definitions/utils";

export function setAllEVCols(x) {
  useEVCols.setState({ x });
}

export function duplicateEvCol({ dbSource, id, newId, newName }) {
  useEVCols.setState((state) => {
    const dbSlice = state.x[dbSource];
    dbSlice[newId] = _.cloneDeep(dbSlice[id]);
    dbSlice[newId].name = newName;
  });
}
export function duplicateDbSource({ oldDbSource, newDbSource }) {
  useEVCols.setState((state) => {
    if (!(newDbSource in state.x)) {
      return;
    }
    const oldDb = state.x[oldDbSource];
    const newDb = state.x[newDbSource];
    for (const evColId of Object.keys(oldDb)) {
      if (!(evColId in newDb)) {
        newDb[evColId] = _.cloneDeep(oldDb[evColId]);
      }
    }
  });
}
export function initManyEvColIds({ dbSource, collectionIds }) {
  useEVCols.setState((state) => {
    _.forEach(collectionIds, (id) => {
      initValue(state.x, dbSource, {});
      initValue(state.x[dbSource], id, {
        name: createRandomName(),
        values: {},
      });
    });
  });
}
export function initManyEnteredValues({
  dbSource,
  collectionId,
  paramIdsToUITypes,
}) {
  useEVCols.setState((state) => {
    _.forEach(paramIdsToUITypes, (uiType, id) => {
      state.x[dbSource][collectionId].values[id] = newEV(uiType);
    });
  });
}
export function setEnteredValue({
  dbSource,
  collectionId,
  paramInfoId,
  value,
}) {
  useEVCols.setState((state) => {
    state.x[dbSource][collectionId].values[paramInfoId] = value;
  });
}
export function deleteParamInfoFromEVCol({ dbSource, evColId, ids }) {
  useEVCols.setState((state) => {
    state.x[dbSource][evColId].values = _.omit(
      state.x[dbSource][evColId].values,
      ids,
    );
  });
}
export function updateEVCols({ evCols }) {
  useEVCols.setState((state) => {
    state.x = { ...state.x, ...evCols };
  });
}
