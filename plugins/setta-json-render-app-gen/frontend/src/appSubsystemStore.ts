import type { StateCreator, StoreApi } from "zustand";
import { createWithEqualityFn } from "zustand/traditional";

export { createWithEqualityFn };

type ResetCallback = (api: StoreApi<unknown>) => Record<string, unknown>;
type AppSubsystemResetFn = (callback?: ResetCallback) => void;
type AppSubsystemResettableState = {
  reset: AppSubsystemResetFn;
};

export function withAppSubsystemResetFn<TState>(
  config: StateCreator<TState>,
): StateCreator<TState & AppSubsystemResettableState> {
  return (set, get, api) => {
    const initialState = config(set, get, api);

    const reset: AppSubsystemResetFn = (callback) => {
      const additionalResetState = callback ? callback(api) : {};
      set(
        {
          ...initialState,
          ...additionalResetState,
          reset,
        },
        true,
      );
    };

    return {
      ...initialState,
      reset,
    };
  };
}
