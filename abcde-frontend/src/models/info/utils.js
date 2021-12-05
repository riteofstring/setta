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
  return _.map(state.x, (x) => x.export());
}

export function exportNestedState(state) {
  return _.map(state.x, (y, sectionId) =>
    _.map(y, (z) => {
      const output = z.export();
      output.sectionId = sectionId;
      return output;
    })
  );
}

export function exportAllStates(state) {
  return {
    sectionInfos: state.sectionInfos.export(),
    objInfos: state.objInfos.export(),
    paramInfos: state.paramInfos.export(),
    kwargInfos: state.kwargInfos.export(),
    sectionTypes: state.sectionTypes.export(),
    uiTypes: state.uiTypes.export(),
    uiTypeConfigs: state.uiTypeConfigs.export(),
    allModuleInfo: state.master.allModuleInfo,
    allObjCollections: state.master.allObjCollections,
    allParamCollections: state.master.allParamCollections,
  };
}
