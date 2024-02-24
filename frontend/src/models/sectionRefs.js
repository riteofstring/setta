import { useEffect, useRef } from "react";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

export const useSectionRefs = createProjectState(
  immer((set) => ({
    withNested: {},
    selfOnly: {},
    setRef: ({ sectionId, withNested, selfOnly }) =>
      set((state) => {
        if (withNested) {
          state.withNested[sectionId] = withNested;
        } else {
          state.selfOnly[sectionId] = selfOnly;
        }
      }),
    deleteRef: ({ sectionId }) =>
      set((state) => {
        delete state.withNested[sectionId];
        delete state.selfOnly[sectionId];
      }),
  })),
);

export function useSectionRefAndInit(sectionId, type) {
  const ref = useRef(null);

  useEffect(() => {
    useSectionRefs.getState().setRef({ sectionId, [type]: ref.current });
    return () => useSectionRefs.getState().deleteRef({ sectionId });
  }, []);

  return ref;
}

export function useTrueSectionSize(sectionId) {
  const height = useSectionRefs((x) => x.withNested[sectionId].clientHeight);
  const width = useSectionRefs((x) => x.withNested[sectionId].clientWidth);
  return { width, height };
}
