import { createWithEqualityFn as _create } from "zustand/traditional";

//https://github.com/pmndrs/zustand/blob/main/docs/guides/how-to-reset-state.md
//https://github.com/pmndrs/zustand/issues/1494

export const create = (f) => {
  if (f === undefined) {
    return create;
  }
  const store = _create(f, Object.is);
  addResetter(store);
  addStatePointer(store, STATE_TYPES.BASE_STATE);
  return store;
};

export const createProjectState = (f) => {
  const store = create(f);
  addStatePointer(store, STATE_TYPES.PROJECT_STATE);
  return store;
};

export const STATE_TYPES = {
  PROJECT_STATE: "PROJECT_STATE",
  BASE_STATE: "BASE_STATE",
};

export const stateDict = {
  [STATE_TYPES.BASE_STATE]: [],
  [STATE_TYPES.PROJECT_STATE]: [],
};

function addResetter(state) {
  const initialState = state.getState();
  // reset function definition
  const resetFn = (callback) => {
    // we have to explicitly include resetFn in initialState
    // since the initialState defined above does not have "reset" as part of it.
    const additionalResetState = callback ? callback(state) : {};
    const initialStateWithReset = {
      ...initialState,
      ...additionalResetState,
      reset: resetFn,
    };
    state.setState(initialStateWithReset, true);
    if (state.temporal) {
      state.temporal.getState().clear();
    }
  };
  // add it to the state
  state.setState({ reset: resetFn });
}

function addStatePointer(state, stateType) {
  stateDict[stateType].push(state);
}

export function withVersion(initialState) {
  return { ...initialState, version: 0 };
}

function resetStores(stateType) {
  for (const state of stateDict[stateType]) {
    state.getState().reset();
  }
}

export function resetAllStores() {
  resetStores(STATE_TYPES.BASE_STATE);
}

export function resetProjectStores() {
  resetStores(STATE_TYPES.PROJECT_STATE);
}

export function initValue(state, id, value) {
  if (!(id in state)) {
    state[id] = value;
  }
  return state[id];
}

export function pauseTemporal() {
  for (const s of stateDict[STATE_TYPES.PROJECT_STATE]) {
    if (s.temporal) {
      s.temporal.getState().pause();
      if (s.getState().version === undefined) {
        throw new Error("temporal state version should not be undefined");
      }
    }
  }
}
