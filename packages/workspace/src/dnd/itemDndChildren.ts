import { createStore } from "zustand/vanilla";
import { insertIntoArray } from "../document/arrayUtils.js";
import { withResetFn } from "../state/storeUtils.js";
import {
  useWorkspaceHost,
  useWorkspaceStore,
} from "../workspaceHostContext.js";
import { createHostStoreGetter } from "../state/hostStore.js";
import type { WorkspaceHost } from "../workspaceHost.js";
import {
  getItemDndId,
  getTempItemDndId,
  isTempItem,
  type ItemListKey,
} from "./itemDndState.js";

type ItemDndChildrenState = {
  x: Record<string, Array<string>>;
  y: Record<string, string>;
};

type TempItemReplacementContext = {
  parentId: string;
  tempId: string;
  itemSet: Set<string>;
};

function createItemDndChildrenStore() {
  return createStore(
    withResetFn<ItemDndChildrenState>(() => ({
      x: {},
      y: {},
    })),
  );
}

export const getItemDndChildrenStore = createHostStoreGetter(
  createItemDndChildrenStore,
);

export function useItemDndChildren<T>(
  selector: (state: ItemDndChildrenState) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useWorkspaceStore(
    getItemDndChildrenStore(useWorkspaceHost()),
    selector,
    equalityFn,
  );
}

function getTempItemReplacementContext(
  state: ItemDndChildrenState,
  activeId: string,
  listKey: ItemListKey | null,
  itemIds: Array<string>,
): TempItemReplacementContext | null {
  const [firstItemId] = itemIds;
  if (!listKey || firstItemId === undefined) {
    return null;
  }
  const parentId = state.y[firstItemId];
  if (!parentId) {
    return null;
  }

  return {
    parentId,
    tempId: getTempItemDndId(getItemDndId(activeId, listKey)),
    itemSet: new Set(itemIds),
  };
}

function withoutTempItemChildren(
  x: Record<string, Array<string>>,
): Record<string, Array<string>> {
  const next = { ...x };
  for (const [parentId, children] of Object.entries(next)) {
    const nextChildren = children.filter((childId) => !isTempItem(childId));
    if (nextChildren.length !== children.length) {
      next[parentId] = nextChildren;
    }
  }
  return next;
}

function withoutTempItemParents(
  y: Record<string, string>,
): Record<string, string> {
  const next = { ...y };
  for (const childId of Object.keys(next)) {
    if (isTempItem(childId)) {
      delete next[childId];
    }
  }
  return next;
}

function findFirstItemIndex(children: Array<string>, itemSet: Set<string>) {
  for (const [index, childId] of children.entries()) {
    if (itemSet.has(childId)) {
      return index;
    }
  }
  return children.length;
}

export function addItemChild(
  host: WorkspaceHost,
  oldParentId: string | null,
  newParentId: string,
  childId: string,
  index: number,
) {
  getItemDndChildrenStore(host).setState((state) => {
    const x = { ...state.x };
    if (oldParentId) {
      x[oldParentId] = (x[oldParentId] ?? []).filter((id) => id !== childId);
    }

    const existingChildren = x[newParentId] ?? [];
    const nextChildren = existingChildren.filter((id) => id !== childId);
    x[newParentId] = insertIntoArray(nextChildren, index, childId);
    return { x, y: { ...state.y, [childId]: newParentId } };
  });
}

export function replaceItemsWithTemp(
  host: WorkspaceHost,
  activeId: string,
  listKey: ItemListKey | null,
  itemIds: Array<string>,
) {
  getItemDndChildrenStore(host).setState((state) => {
    const context = getTempItemReplacementContext(
      state,
      activeId,
      listKey,
      itemIds,
    );
    if (!context) {
      return state;
    }

    const x = withoutTempItemChildren(state.x);
    const y = withoutTempItemParents(state.y);

    const currChildren = x[context.parentId] ?? [];
    const insertIndex = findFirstItemIndex(currChildren, context.itemSet);
    const nextChildren = currChildren.filter((id) => !context.itemSet.has(id));

    x[context.parentId] = insertIntoArray(
      nextChildren,
      insertIndex,
      context.tempId,
    );
    y[context.tempId] = context.parentId;
    for (const itemId of itemIds) {
      delete y[itemId];
    }
    return { x, y };
  });
}

export function updateItemChildren(
  host: WorkspaceHost,
  itemIdsToChildren: Record<string, Array<string>>,
) {
  const y: Record<string, string> = {};
  for (const [id, children] of Object.entries(itemIdsToChildren)) {
    for (const childId of children) {
      y[childId] = id;
    }
  }
  getItemDndChildrenStore(host).setState({ x: itemIdsToChildren, y });
}

export function resetItemDndChildren(host: WorkspaceHost) {
  getItemDndChildrenStore(host).getState().reset();
}

export function getItemDndParentId(host: WorkspaceHost, itemId: string) {
  return getItemDndChildrenStore(host).getState().y[itemId];
}

export function getItemDndParentByChild(
  host: WorkspaceHost,
  listKey: ItemListKey | null,
): Record<string, string | null> {
  const base = getItemDndChildrenStore(host).getState().y;
  if (!listKey) {
    return base;
  }
  const output: Record<string, string | null> = {};
  for (const [childId, parentId] of Object.entries(base)) {
    const childDndId = isTempItem(childId)
      ? childId
      : getItemDndId(childId, listKey);
    const parentDndId = parentId
      ? isTempItem(parentId)
        ? parentId
        : getItemDndId(parentId, listKey)
      : null;
    output[childDndId] = parentDndId;
  }
  return output;
}
