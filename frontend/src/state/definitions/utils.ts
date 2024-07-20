import { StateCreator } from "zustand";
import { createWithEqualityFn as _create } from "zustand/traditional";

//https://github.com/pmndrs/zustand/blob/main/docs/guides/how-to-reset-state.md
//https://github.com/pmndrs/zustand/issues/1494

export const create = (<T>(f: StateCreator<T> | undefined) => {
  if (f === undefined) {
    return create;
  }
  const store = _create(f, Object.is);
  addResetter(store, STATE_TYPES.BASE_STATE);
  addStatePointer(store, STATE_TYPES.BASE_STATE);
  return store;
}) as typeof _create;

export const createProjectState = (<T>(f: StateCreator<T>) => {
  const store = create(f);
  addResetter(store, STATE_TYPES.PROJECT_STATE);
  addStatePointer(store, STATE_TYPES.PROJECT_STATE);
  return store;
}) as typeof _create;

function createSubStateDict() {
  return { resetters: [], statePointers: [] };
}

export const STATE_TYPES = {
  PROJECT_STATE: "PROJECT_STATE",
  BASE_STATE: "BASE_STATE",
} as const;

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

function addResetter(state, stateType: keyof typeof STATE_TYPES) {
  stateDict[stateType].resetters.push(createResetter(state));
}

function addStatePointer(state, stateType: keyof typeof STATE_TYPES) {
  stateDict[stateType].statePointers.push(state);
}

export function stateWithResetFn(initialState) {
  return (set) => ({
    ...initialState,
    reset: () => set(initialState),
  });
}

export function initValue(state, id, value) {
  if (!(id in state)) {
    state[id] = value;
  }
  return state[id];
}
