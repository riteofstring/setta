import { immer } from "zustand/middleware/immer";
import { create } from "../utils";

export const useSectionParamFilter = create(
  immer((set) => ({
    x: {},
    setFilter: ({ sectionId, filter }) =>
      set((state) => {
        state.x[sectionId] = filter;
      }),
  }))
);
