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
    removeChild: (childId) =>
      set((state) => {
        const oldParentId = state.y[childId];
        if (oldParentId) {
          state.x[oldParentId] = state.x[oldParentId].filter(
            (x) => x !== childId,
          );
          state.y[childId] = undefined;
        }
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
