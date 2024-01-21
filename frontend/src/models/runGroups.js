import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

const initialState = {
  x: {
    "6a2056d0-214e-4d82-9c91-ee915069c7d4": {
      name: "Big Run",
      sections: { "d96cb110-6f72-435a-b745-2d55e277f983": null },
      selected: false,
    },
    "2226fedc-e7fd-4a8f-beee-9b9e91b6dec1": {
      name: "Regular Run",
      sections: null,
      selected: true,
    },
  },
  version: 0,
};

export const useRunGroups = createProjectState(
  temporal(
    immer((set) => ({
      ...initialState,
      setSelected: ({ id, selected }) =>
        set((state) => {
          state.x[id].selected = selected;
        }),
    }))
  )
);

useRunGroups.temporal.getState().pause();
