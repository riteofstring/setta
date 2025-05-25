import { StateCreator } from "zustand";

export const ZUNDO_TEMPORAL_OPTIONS = { limit: 200 };

//https://github.com/pmndrs/zustand/blob/main/docs/guides/how-to-reset-state.md
//https://github.com/pmndrs/zustand/issues/1494

export function withProjectState<T>(store: T): T {
  addStatePointer(store, STATE_TYPES.PROJECT_STATE);
  return store;
}

export const STATE_TYPES = {
  PROJECT_STATE: "PROJECT_STATE",
};

export const stateDict = {
  [STATE_TYPES.PROJECT_STATE]: [],
};

export function withResetFn<T>(
  config: StateCreator<T>,
): StateCreator<T & { reset: Function }> {
  return (set, get, api) => {
    const initialState = config(set, get, api);

    // Define the reset function
    const resetFn = (callback) => {
      // we have to explicitly include resetFn in initialState
      // since the initialState defined above does not have "reset" as part of it.
      const additionalResetState = callback ? callback(api) : {};
      const initialStateWithReset = {
        ...initialState,
        ...additionalResetState,
        reset: resetFn,
      };
      set(initialStateWithReset, true);
    };

    // Return the initial state with reset included
    return {
      ...initialState,
      reset: resetFn,
    };
  };
}

function addStatePointer(state, stateType) {
  stateDict[stateType].push(state);
}

export function withVersion<T>(state: T): T & { version: number } {
  return { ...state, version: 0 };
}

function resetStores(stateType) {
  for (const state of stateDict[stateType]) {
    state.getState().reset?.();
    if (state.temporal) {
      state.temporal.getState().clear();
    }
  }
}

export function resetProjectStores() {
  resetStores(STATE_TYPES.PROJECT_STATE);
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
