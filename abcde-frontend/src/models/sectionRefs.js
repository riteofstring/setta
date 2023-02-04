import { immer } from "zustand/middleware/immer";
import { create } from "./utils";

export const useSectionRefs = createRefState();
export const useKwargRefs = createRefState();
export const useParamRefs = createRefState();

function createRefState() {
  return create(
    immer((set) => ({
      x: {},
      setRef: ({ sectionId, ref }) =>
        set((state) => {
          state.x[sectionId] = ref;
        }),
    }))
  );
}
