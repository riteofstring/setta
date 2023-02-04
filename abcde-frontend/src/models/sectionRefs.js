import { immer } from "zustand/middleware/immer";
import { create } from "./utils";

export const useSectionRefs = create(
  immer((set) => ({
    x: {},
    setRef: ({ sectionId, ref }) =>
      set((state) => {
        state.x[sectionId] = ref;
      }),
  }))
);
