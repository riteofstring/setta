import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

const initialState = {
  x: {},
  version: 0,
};

export const useRunGroups = createProjectState(
  temporal(
    immer((set) => ({
      ...initialState,
      resetAndSetAll: (payload) => set({ x: payload }),
      toggleSelected: (id) =>
        set((state) => {
          state.x[id].selected = !state.x[id].selected;
        }),
      toggleSection: ({ id, sectionId }) =>
        set((state) => {
          if (sectionId in state.x[id].sections) {
            delete state.x[id].sections[sectionId];
          } else {
            state.x[id].sections[sectionId] = {};
          }
        }),
      toggleParamSweep: ({ id, sectionId, paramSweepId }) =>
        set((state) => {
          const sectionIsSelected = sectionId in state.x[id].sections;
          if (
            sectionIsSelected &&
            paramSweepId in state.x[id].sections[sectionId]
          ) {
            delete state.x[id].sections[sectionId][paramSweepId];
          } else {
            if (sectionIsSelected) {
              state.x[id].sections[sectionId][paramSweepId] = true;
            } else {
              state.x[id].sections[sectionId] = { [paramSweepId]: true };
            }
          }
        }),
    })),
  ),
);

useRunGroups.temporal.getState().pause();
