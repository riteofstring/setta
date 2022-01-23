import { exportInfo } from "classes/mutableInfo";

export function setToDefault(state, firstId, secondId, newValueFn, attr = "x") {
  if (!(firstId in state[attr])) {
    state[attr][firstId] = {};
  }
  if (!(secondId in state[attr][firstId])) {
    state[attr][firstId][secondId] = newValueFn();
  }
  return state[attr][firstId][secondId];
}

export function exportState(state) {
  return _.map(state.x, (x) => exportInfo(x));
}

export function exportAllStates(state) {
  return {
    ...state.sectionInfos.export(),
    objInfos: state.objInfos.export(),
    paramInfos: state.paramInfos.export(),
    kwargInfos: state.kwargInfos.export(),
    uiTypes: state.uiTypes.export(),
    enteredValues: state.enteredValues.export(),
    allObjCollections: state.master.allObjCollections,
    allParamCollections: state.master.allParamCollections,
  };
}
