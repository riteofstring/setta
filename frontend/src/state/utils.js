import { createWithEqualityFn as _create } from "zustand/traditional";

//https://github.com/pmndrs/zustand/blob/main/docs/guides/how-to-reset-state.md
//https://github.com/pmndrs/zustand/issues/1494

export const create = (f) => {
  if (f === undefined) {
    return create;
  }
  const store = _create(f, Object.is);
  addResetter(store, STATE_TYPES.BASE_STATE);
  addStatePointer(store, STATE_TYPES.BASE_STATE);
  return store;
};

export const createProjectState = (f) => {
  const store = create(f);
  addResetter(store, STATE_TYPES.PROJECT_STATE);
  addStatePointer(store, STATE_TYPES.PROJECT_STATE);
  return store;
};

function createSubStateDict() {
  return { resetters: [], statePointers: [] };
}

export const STATE_TYPES = {
  PROJECT_STATE: "PROJECT_STATE",
  BASE_STATE: "BASE_STATE",
};

export const stateDict = {
  [STATE_TYPES.BASE_STATE]: createSubStateDict(),
  [STATE_TYPES.PROJECT_STATE]: createSubStateDict(),
};

function createResetter(state) {
  const initialState = state.getState();
  return () => {
    state.setState(initialState);
    if (state.temporal) {
      state.temporal.getState().clear();
    }
  };
}

function addResetter(state, stateType) {
  stateDict[stateType].resetters.push(createResetter(state));
}

function addStatePointer(state, stateType) {
  stateDict[stateType].statePointers.push(state);
}

export function stateWithResetFn(initialState) {
  return (set) => ({
    ...initialState,
    reset: () => set(initialState),
  });
}

function resetStores(stateType) {
  for (const resetter of stateDict[stateType].resetters) {
    resetter();
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
  for (const s of stateDict[STATE_TYPES.PROJECT_STATE].statePointers) {
    if (s.temporal) {
      s.temporal.getState().pause();
    }
  }
}
