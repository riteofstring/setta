import { createProjectState } from "models/utils";
import { immer } from "zustand/middleware/immer";

export const useDndChildren = createProjectState(
  immer((set) => ({
    x: {},
    y: {},
    addChild: ({ oldParentId, newParentId, childId, index }) =>
      set((state) => {
        if (oldParentId) {
          state.x[oldParentId] = state.x[oldParentId].filter(
            (x) => x !== childId,
          );
        }

        state.x[newParentId] = [
          ...state.x[newParentId].slice(0, index),
          childId,
          ...state.x[newParentId].slice(index),
        ];

        state.y[childId] = newParentId;
      }),
    setChildren: ({ sectionId, children }) =>
      set((state) => {
        state.x[sectionId] = children;
      }),
    setParentId: ({ sectionId, parentId }) =>
      set((state) => {
        state.y[sectionId] = parentId;
      }),
    reset: (sectionIdsToChildren) =>
      set((state) => {
        state.x = sectionIdsToChildren;
        for (const [id, children] of Object.entries(sectionIdsToChildren)) {
          for (const c of children) {
            state.y[c] = id;
          }
        }
      }),
  })),
);
