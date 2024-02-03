import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";

export const useSectionParamFilter = createProjectState(
  immer((set) => ({
    x: {},
    setFilter: ({ sectionId, filter }) =>
      set((state) => {
        state.x[sectionId] = filter;
      }),
  }))
);
