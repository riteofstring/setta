import { createProjectState } from "models/utils";
import { immer } from "zustand/middleware/immer";

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
