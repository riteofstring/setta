import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";

// This is a special state that maps directly from
// sectionIds to current params and paramCollections

const initialState = { params: {}, paramCollections: {} };

export const useSectionToParams = createProjectState(
  immer((set) => ({
    ...initialState,
    setParams: ({ sectionId, params }) =>
      set((state) => {
        state.params[sectionId] = params;
      }),
    setParamCollections: ({ sectionId, paramCollections }) =>
      set((state) => {
        state.paramCollections[sectionId] = paramCollections;
      }),
  }))
);
