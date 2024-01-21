import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

const initialState = {
  x: {
    "6a2056d0-214e-4d82-9c91-ee915069c7d4": {
      name: "Big Run",
      sections: { "d96cb110-6f72-435a-b745-2d55e277f983": {} },
      selected: false,
    },
    "2226fedc-e7fd-4a8f-beee-9b9e91b6dec1": {
      name: "Regular Run",
      sections: {},
      selected: true,
    },
  },
  version: 0,
};

export const useRunGroups = createProjectState(
  temporal(
    immer((set) => ({
      ...initialState,
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
    }))
  )
);

useRunGroups.temporal.getState().pause();
