import { runAppSubsystemProjectResetHooks } from "plugins/appSubsystemRuntime";
import { resetAuthoritativeProjectChatWindowingState } from "state/actions/projectChatWindowingAuthoritative";
import { resetStreamingTracker } from "state/aiStreamingTracker";
import { type StateCreator, type StoreApi } from "zustand";

//https://github.com/pmndrs/zustand/blob/main/docs/guides/how-to-reset-state.md
//https://github.com/pmndrs/zustand/issues/1494

export function withProjectState<T>(store: T): T {
  addStatePointer(store, STATE_TYPES.PROJECT_STATE);
  return store;
}

const STATE_TYPES = {
  PROJECT_STATE: "PROJECT_STATE",
};

const stateDict = {
  [STATE_TYPES.PROJECT_STATE]: [],
};

export function withResetFn<T>(
  config: StateCreator<T>,
): StateCreator<T & { reset: ResetFn }> {
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

type ResetCallback = (api: StoreApi<unknown>) => Record<string, unknown>;
type ResetFn = (callback?: ResetCallback) => void;

function addStatePointer(state, stateType) {
  stateDict[stateType].push(state);
}

function resetStores(stateType) {
  for (const state of stateDict[stateType]) {
    state.getState().reset?.();
  }
}

export function resetProjectStores() {
  resetStores(STATE_TYPES.PROJECT_STATE);
  resetStreamingTracker();
  runAppSubsystemProjectResetHooks();
  resetAuthoritativeProjectChatWindowingState();
}
