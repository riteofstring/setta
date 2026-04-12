import { withProjectState, withResetFn } from "state/utils";
import { insertIntoArray } from "utils/utils";
import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";
import {
  getParamDndItemId,
  getTempParamDndId,
  isTempParam,
  type ParamListKey,
} from "./paramDndState";

type ParamDndChildrenState = {
  x: Record<string, Array<string>>;
  y: Record<string, string>;
};

type TempParamReplacementContext = {
  parentId: string;
  tempId: string;
  paramSet: Set<string>;
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

function getTempParamReplacementContext(
  state: ParamDndChildrenState,
  activeId: string,
  listKey: ParamListKey | null,
  paramIds: string[],
): TempParamReplacementContext | null {
  if (!listKey || paramIds.length === 0) {
    return null;
  }
  const parentId = state.y[paramIds[0]];
  if (!parentId) {
    return null;
  }

  return {
    parentId,
    tempId: getTempParamDndId(getParamDndItemId(activeId, listKey)),
    paramSet: new Set(paramIds),
  };
}

function clearTempParamChildren(state: ParamDndChildrenState) {
  for (const [parentId, children] of Object.entries(state.x)) {
    const nextChildren = children.filter((childId) => !isTempParam(childId));
    if (nextChildren.length !== children.length) {
      state.x[parentId] = nextChildren;
    }
  }
}

function clearTempParamParents(state: ParamDndChildrenState) {
  for (const childId of Object.keys(state.y)) {
    if (isTempParam(childId)) {
      delete state.y[childId];
    }
  }
}

function findFirstParamIndex(children: string[], paramSet: Set<string>) {
  for (const [index, childId] of children.entries()) {
    if (paramSet.has(childId)) {
      return index;
    }
  }
  return children.length;
}

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

export function replaceParamsWithTemp(
  activeId: string,
  listKey: ParamListKey | null,
  paramIds: string[],
) {
  useParamDndChildren.setState((state) => {
    const context = getTempParamReplacementContext(
      state,
      activeId,
      listKey,
      paramIds,
    );
    if (!context) {
      return;
    }

    clearTempParamChildren(state);
    clearTempParamParents(state);

    const currChildren = state.x[context.parentId] ?? [];
    const insertIndex = findFirstParamIndex(currChildren, context.paramSet);
    const nextChildren = currChildren.filter((id) => !context.paramSet.has(id));

    state.x[context.parentId] = insertIntoArray(
      nextChildren,
      insertIndex,
      context.tempId,
    );
    state.y[context.tempId] = context.parentId;
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

export function getParamDndParentByChild(
  listKey: ParamListKey | null,
): Record<string, string | null> {
  const base = useParamDndChildren.getState().y;
  if (!listKey) {
    return base;
  }
  const output: Record<string, string | null> = {};
  for (const [childId, parentId] of Object.entries(base)) {
    const childDndId = isTempParam(childId)
      ? childId
      : getParamDndItemId(childId, listKey);
    const parentDndId = parentId
      ? isTempParam(parentId)
        ? parentId
        : getParamDndItemId(parentId, listKey)
      : null;
    output[childDndId] = parentDndId;
  }
  return output;
}
