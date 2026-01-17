import { withProjectState, withResetFn } from "state/utils";
import { insertIntoArray } from "utils/utils";
import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";
import { getDndSectionId } from "./dndState";

type ZustandDndChildren = {
  x: Record<string, Array<string>>;
  y: Record<string, string>;
};

export const useDndChildren = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<ZustandDndChildren>(() => ({
        x: {}, // parent id to list of children
        y: {}, // child id to parent id
      })),
    ),
  ),
);

export function addDndChild(
  oldParentId: string | null,
  newParentId: string,
  childId: string,
  index: number,
) {
  useDndChildren.setState((state) => {
    if (oldParentId) {
      state.x[oldParentId] = (state.x[oldParentId] ?? []).filter(
        (x) => x !== childId,
      );
    }

    const existingChildren = state.x[newParentId] ?? [];
    state.x[newParentId] = insertIntoArray(existingChildren, index, childId);
    state.y[childId] = newParentId;
  });
}

export function removeDndChild(childId: string) {
  useDndChildren.setState((state) => {
    const oldParentId = state.y[childId];
    if (oldParentId) {
      state.x[oldParentId] = (state.x[oldParentId] ?? []).filter(
        (x) => x !== childId,
      );
      delete state.y[childId];
    }
  });
}

export function replaceDndSectionWithTemp(id: string) {
  useDndChildren.setState((state) => {
    const parentId = state.y[id];
    if (parentId) {
      const currChildren = state.x[parentId] ?? [];
      const index = currChildren.indexOf(id);
      if (index === -1) {
        return;
      }
      const tempId = getDndSectionId(id);
      currChildren[index] = tempId;
      state.y[tempId] = parentId;
      delete state.y[id];
    }
  });
}

export function updateDndChildren(
  sectionIdsToChildren: Record<string, Array<string>>,
) {
  useDndChildren.setState((state) => {
    state.x = sectionIdsToChildren;
    state.y = {};
    for (const [id, children] of Object.entries(sectionIdsToChildren)) {
      for (const c of children) {
        state.y[c] = id;
      }
    }
  });
}
