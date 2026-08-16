import { createWithEqualityFn } from "zustand/traditional";
import { insertIntoArray } from "../document/arrayUtils";
import { withResetFn } from "../state/storeUtils";
import {
  getItemDndId,
  getTempItemDndId,
  isTempItem,
  type ItemListKey,
} from "./itemDndState";

// The reference's param dnd children store (`paramDndChildren.ts`): the live parent→children
// projection an item drag mutates (temp placeholder replacement, live re-parenting) before one
// commit funnel writes the canonical item structure. Package store style (plain setState instead
// of the reference's immer middleware; identical observable state, including the referential
// stability of untouched child arrays).

type ItemDndChildrenState = {
  x: Record<string, Array<string>>;
  y: Record<string, string>;
};

type TempItemReplacementContext = {
  parentId: string;
  tempId: string;
  itemSet: Set<string>;
};

export const useItemDndChildren = createWithEqualityFn(
  withResetFn<ItemDndChildrenState>(() => ({
    x: {}, // parent id to list of children
    y: {}, // child id to parent id
  })),
);

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
  oldParentId: string | null,
  newParentId: string,
  childId: string,
  index: number,
) {
  useItemDndChildren.setState((state) => {
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
  activeId: string,
  listKey: ItemListKey | null,
  itemIds: Array<string>,
) {
  useItemDndChildren.setState((state) => {
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
  itemIdsToChildren: Record<string, Array<string>>,
) {
  const y: Record<string, string> = {};
  for (const [id, children] of Object.entries(itemIdsToChildren)) {
    for (const childId of children) {
      y[childId] = id;
    }
  }
  useItemDndChildren.setState({ x: itemIdsToChildren, y });
}

export function resetItemDndChildren() {
  useItemDndChildren.getState().reset();
}

export function getItemDndParentId(itemId: string) {
  return useItemDndChildren.getState().y[itemId];
}

export function getItemDndParentByChild(
  listKey: ItemListKey | null,
): Record<string, string | null> {
  const base = useItemDndChildren.getState().y;
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
