import { temporal } from "zundo";
import { StateCreator, StoreMutators } from "zustand";

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

export function withResetFn<
  T,
  Mps extends [keyof StoreMutators<unknown, unknown>, unknown][] = [],
  Mcs extends [keyof StoreMutators<unknown, unknown>, unknown][] = [],
>(
  config: StateCreator<T, Mps, Mcs>,
): StateCreator<T & { reset: Function }, Mps, Mcs> {
  return (set, get, api) => {
    // Call the original config with the set/get/api
    const initialState = config(
      set as any, // Type assertion to bypass the type mismatch
      get as any,
      api,
    );

    // Define the reset function
    const resetFn = (callback) => {
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

export function withTemporal<
  T,
  Mps extends [keyof StoreMutators<unknown, unknown>, unknown][] = [],
  Mcs extends [keyof StoreMutators<unknown, unknown>, unknown][] = [],
>(state: StateCreator<T, Mps, Mcs>): StateCreator<T, Mps, Mcs> {
  return temporal(state as any, { limit: 200 }) as any;
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
