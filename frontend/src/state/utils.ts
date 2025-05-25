import { temporal } from "zundo";
import { createWithEqualityFn as _create } from "zustand/traditional";

//https://github.com/pmndrs/zustand/blob/main/docs/guides/how-to-reset-state.md
//https://github.com/pmndrs/zustand/issues/1494

export const ARRAY_OF_STORES = [];

export const create = (f) => {
  if (f === undefined) {
    return create;
  }
  const store = _create(f, Object.is);
  ARRAY_OF_STORES.push(store);
  return store;
};

export function withResetFn(config) {
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

export function withVersion(initialState) {
  return { ...initialState, version: 0 };
}

export function withTemporal(...props) {
  return temporal(...props, { limit: 200 });
}

export function resetStores() {
  for (const state of ARRAY_OF_STORES) {
    state.getState().reset?.();
    if (state.temporal) {
      state.temporal.getState().clear();
    }
  }
}

export function pauseTemporal() {
  for (const s of ARRAY_OF_STORES) {
    if (s.temporal) {
      s.temporal.getState().pause();
      if (s.getState().version === undefined) {
        throw new Error("temporal state version should not be undefined");
      }
    }
  }
}
