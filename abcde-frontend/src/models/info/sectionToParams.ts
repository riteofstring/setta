import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";

// This is a special state that maps directly from
// sectionIds to current callables and params

const initialState = { callables: {}, params: {} };

export const useSectionToParams = createProjectState(
  immer((set) => ({
    ...initialState,
    setCallablesAndParams: ({ sectionId, callables, params }) =>
      set((state) => {
        state.callables[sectionId] = callables;
        state.params[sectionId] = params;
      }),
  }))
);
