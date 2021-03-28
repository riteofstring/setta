export const getAllNonFunctions = (x) => {
  return Object.fromEntries(
    Object.entries(x).filter(([key, value]) => !(value instanceof Function))
  );
};

export const setEntireState = (state, newState) => {
  for (let key of Object.keys(getAllNonFunctions(state))) {
    state[key] = newState[key];
  }
};

export const getCompleteState = (storeState) => {
  return {
    masterState: storeState.master,
    globalCurrState: storeState.globalCurr,
    yamlEntryState: storeState.yamlEntry,
    factoriesInfoState: storeState.factoriesInfo,
    funcsInfoState: storeState.funcsInfo,
  };
};

export const stringifyCompleteState = (statesToSave) => {
  let completeState = {};
  for (let key of Object.keys(statesToSave)) {
    completeState[key] = JSON.stringify(getAllNonFunctions(statesToSave[key]));
  }
  completeState = JSON.stringify(completeState);
  return completeState;
};
