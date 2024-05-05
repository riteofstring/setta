import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";

// This is a special state that maps directly from
// sectionIds to current callables and params

const initialState = { callables: {}, params: {} };

export const useSectionToParams = createProjectState(
  temporal(
    immer((set) => ({
      ...initialState,
      setCallables: ({ sectionId, callables }) =>
        set((state) => {
          state.callables[sectionId] = callables;
        }),
      setParams: ({ sectionId, params }) =>
        set((state) => {
          state.params[sectionId] = params;
        }),
    })),
  ),
);

useSectionToParams.temporal.getState().pause();
