import { withProjectState, withResetFn } from "state/utils";
import { insertIntoArray } from "utils/utils";
import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";
import { getDndSectionId, isTempSection } from "./dndState";

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
    const nextChildren = existingChildren.filter((x) => x !== childId);
    state.x[newParentId] = insertIntoArray(nextChildren, index, childId);
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

export function replaceDndSectionsWithTemp(
  activeId: string,
  sectionIds: string[],
) {
  useDndChildren.setState((state) => {
    if (sectionIds.length === 0) {
      return;
    }
    const parentId = state.y[sectionIds[0]];
    if (!parentId) {
      return;
    }
    const tempId = getDndSectionId(activeId);

    for (const [key, children] of Object.entries(state.x)) {
      const nextChildren = children.filter(
        (childId) => !isTempSection(childId),
      );
      if (nextChildren.length !== children.length) {
        state.x[key] = nextChildren;
      }
    }
    for (const childId of Object.keys(state.y)) {
      if (isTempSection(childId)) {
        delete state.y[childId];
      }
    }

    const sectionIdSet = new Set(sectionIds);
    const currChildren = state.x[parentId] ?? [];
    const indices = sectionIds
      .map((sectionId) => currChildren.indexOf(sectionId))
      .filter((idx) => idx >= 0);
    const nextChildren = currChildren.filter(
      (childId) => !sectionIdSet.has(childId),
    );
    const insertIndex =
      indices.length > 0 ? Math.min(...indices) : nextChildren.length;

    state.x[parentId] = insertIntoArray(nextChildren, insertIndex, tempId);
    state.y[tempId] = parentId;
    for (const sectionId of sectionIds) {
      delete state.y[sectionId];
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
