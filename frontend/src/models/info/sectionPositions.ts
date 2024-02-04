import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";

export const useSectionPositions = createProjectState(
  immer((set) => ({
    x: {},
    setPosition: ({ sectionId, position }) =>
      set((state) => {
        state.x[sectionId].position = position;
      }),
  })),
);
