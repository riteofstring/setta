import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";

export const useDndChildren = createProjectState(
  immer((set) => ({
    x: {},
    setChildren: ({ sectionId, children }) =>
      set((state) => {
        state.x[sectionId] = children;
      }),
    reset: (sectionIdsToChildren) =>
      set((state) => {
        state.x = sectionIdsToChildren;
      }),
  })),
);
