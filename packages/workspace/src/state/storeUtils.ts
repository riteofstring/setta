import { type StateCreator, type StoreApi } from "zustand";

type ResetCallback = (api: StoreApi<unknown>) => Record<string, unknown>;
type ResetFn = (callback?: ResetCallback) => void;

export function withResetFn<T>(
  config: StateCreator<T>,
): StateCreator<T & { reset: ResetFn }> {
  return (set, get, api) => {
    const initialState = config(
      set as Parameters<StateCreator<T>>[0],
      get as Parameters<StateCreator<T>>[1],
      api as Parameters<StateCreator<T>>[2],
    );

    const resetFn: ResetFn = (callback) => {
      const additionalResetState = callback
        ? callback(api as StoreApi<unknown>)
        : {};
      const initialStateWithReset = {
        ...initialState,
        ...additionalResetState,
        reset: resetFn,
      };
      set(initialStateWithReset as T & { reset: ResetFn }, true);
    };

    return {
      ...initialState,
      reset: resetFn,
    };
  };
}
