import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";
import { withProjectState, withResetFn } from "state/utils";
import { insertIntoArray } from "utils/utils";
import { getParamDndId, isTempParam } from "./paramDndState";

type ParamDndChildrenState = {
  x: Record<string, Array<string>>;
  y: Record<string, string>;
};

export const useParamDndChildren = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<ParamDndChildrenState>(() => ({
        x: {},
        y: {},
      })),
    ),
  ),
);

export function addParamChild(
  oldParentId: string | null,
  newParentId: string,
  childId: string,
  index: number,
) {
  useParamDndChildren.setState((state) => {
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

export function removeParamChild(childId: string) {
  useParamDndChildren.setState((state) => {
    const oldParentId = state.y[childId];
    if (oldParentId) {
      state.x[oldParentId] = (state.x[oldParentId] ?? []).filter(
        (x) => x !== childId,
      );
      delete state.y[childId];
    }
  });
}

export function replaceParamsWithTemp(activeId: string, paramIds: string[]) {
  useParamDndChildren.setState((state) => {
    if (paramIds.length === 0) {
      return;
    }
    const parentId = state.y[paramIds[0]];
    if (!parentId) {
      return;
    }
    const tempId = getParamDndId(activeId);

    for (const [key, children] of Object.entries(state.x)) {
      const nextChildren = children.filter((childId) => !isTempParam(childId));
      if (nextChildren.length !== children.length) {
        state.x[key] = nextChildren;
      }
    }
    for (const childId of Object.keys(state.y)) {
      if (isTempParam(childId)) {
        delete state.y[childId];
      }
    }

    const paramSet = new Set(paramIds);
    const currChildren = state.x[parentId] ?? [];
    const indices = paramIds
      .map((paramId) => currChildren.indexOf(paramId))
      .filter((idx) => idx >= 0);
    const nextChildren = currChildren.filter((id) => !paramSet.has(id));
    const insertIndex =
      indices.length > 0 ? Math.min(...indices) : nextChildren.length;

    state.x[parentId] = insertIntoArray(nextChildren, insertIndex, tempId);
    state.y[tempId] = parentId;
    for (const paramId of paramIds) {
      delete state.y[paramId];
    }
  });
}

export function updateParamChildren(
  paramIdsToChildren: Record<string, Array<string>>,
) {
  useParamDndChildren.setState((state) => {
    state.x = paramIdsToChildren;
    state.y = {};
    for (const [id, children] of Object.entries(paramIdsToChildren)) {
      for (const childId of children) {
        state.y[childId] = id;
      }
    }
  });
}

export function resetParamDndChildren() {
  useParamDndChildren.getState().reset();
}

export function getParamDndParentId(paramId: string) {
  return useParamDndChildren.getState().y[paramId];
}
