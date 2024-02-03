import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

export const useSectionRefs = createProjectState(
  immer((set) => ({
    x: {},
    setRef: ({ sectionId, ref }) =>
      set((state) => {
        state.x[sectionId] = ref;
      }),
  }))
);

export function useTrueSectionSize(sectionId) {
  const height = useSectionRefs((x) => x.x[sectionId].clientHeight);
  const width = useSectionRefs((x) => x.x[sectionId].clientWidth);
  return { width, height };
}
