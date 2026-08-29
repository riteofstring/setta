import type { WorkspaceItem, WorkspaceSectionItemTree } from "./types";

// The reference's param tree helpers (`state/actions/params/paramTree.ts`) over the canonical
// item tree. The reference walks code-object impls behind its variant indirection and recurses
// only into `NestedParam`-typed parents; package items always carry `children`, so the parent
// checks are structural. Typed rows carry an explicit group presentation, while custom rows may
// still supply a host group predicate. The flat projection needs no duplicated `isParent` flag.

type ItemTreeFlatRow = {
  id: string;
  parentId: string;
  depth: number;
};

export type ItemTreeView = {
  rootId: string;
  parentById: Record<string, string | null>;
  flat: Array<ItemTreeFlatRow>;
  visibleChildrenByParent: Record<string, Array<string>>;
};

export function getItemOrThrow(
  itemTree: WorkspaceSectionItemTree,
  itemId: string,
): WorkspaceItem {
  const item = itemTree.items[itemId];
  if (!item) {
    throw new Error(`Unknown item ${itemId}.`);
  }
  return item;
}

export function buildItemParentMap(
  itemTree: WorkspaceSectionItemTree,
): Record<string, string | null> {
  const parentById: Record<string, string | null> = { [itemTree.rootId]: null };

  function walk(parentId: string) {
    for (const childId of getItemOrThrow(itemTree, parentId).children) {
      parentById[childId] = parentId;
      walk(childId);
    }
  }

  walk(itemTree.rootId);
  return parentById;
}

// The visible tree view a list renders and the move logic reasons over. Visibility combines the
// list's host-supplied membership with the package-owned filter (the reference's
// `requiredParamIdsToPaths` keys): an invisible item prunes its whole subtree, while `parentById`
// always covers the full canonical tree.
export function buildItemTreeView(
  itemTree: WorkspaceSectionItemTree,
  topLevelItemIds: Array<string>,
  visibleItemIds: ReadonlySet<string>,
): ItemTreeView {
  const parentById = buildItemParentMap(itemTree);
  const flat: Array<ItemTreeFlatRow> = [];
  const visibleChildrenByParent: Record<string, Array<string>> = {};

  function walk(itemId: string, depth: number, parentId: string) {
    if (!visibleItemIds.has(itemId)) {
      return;
    }
    const item = getItemOrThrow(itemTree, itemId);
    if (!visibleChildrenByParent[parentId]) {
      visibleChildrenByParent[parentId] = [];
    }
    visibleChildrenByParent[parentId].push(itemId);
    flat.push({ id: itemId, parentId, depth });
    for (const childId of item.children) {
      walk(childId, depth + 1, itemId);
    }
  }

  for (const itemId of topLevelItemIds) {
    walk(itemId, 0, itemTree.rootId);
  }

  return { rootId: itemTree.rootId, parentById, flat, visibleChildrenByParent };
}

// Reduces a selection to its roots: an item whose ancestor is also selected moves with that
// ancestor, so it never moves independently.
export function getRootSelectedItemIds(
  parentById: Record<string, string | null>,
  selectedIds: Array<string>,
): Array<string> {
  const selectedSet = new Set(selectedIds);
  return selectedIds.filter((itemId) => {
    let parentId = parentById[itemId] ?? null;
    while (parentId) {
      if (selectedSet.has(parentId)) {
        return false;
      }
      parentId = parentById[parentId] ?? null;
    }
    return true;
  });
}

export function getSharedItemParentId(
  parentById: Record<string, string | null>,
  itemIds: Array<string>,
): string | null {
  const [firstItemId] = itemIds;
  if (firstItemId === undefined) {
    return null;
  }
  const firstParent = parentById[firstItemId] ?? null;
  if (!firstParent) {
    return null;
  }
  for (const itemId of itemIds) {
    if (parentById[itemId] !== firstParent) {
      return null;
    }
  }
  return firstParent;
}

export function isDescendantOfItemSelection(
  parentById: Record<string, string | null>,
  candidateId: string,
  selectedSet: ReadonlySet<string>,
): boolean {
  let currentId: string | null = candidateId;
  while (currentId) {
    if (selectedSet.has(currentId)) {
      return true;
    }
    currentId = parentById[currentId] ?? null;
  }
  return false;
}

// Maps an insertion index within a filtered list back to an index in the parent's full child
// order: the drop lands before the visible anchor row, leaving hidden siblings undisturbed.
export function resolveFullIndexForVisibleInsertion({
  targetVisibleIndex,
  movingIds,
  visibleSiblings,
  fullChildren,
}: {
  targetVisibleIndex: number;
  movingIds: ReadonlySet<string>;
  visibleSiblings: Array<string>;
  fullChildren: Array<string>;
}): number | null {
  const remainingChildren = fullChildren.filter((id) => !movingIds.has(id));
  const remainingVisible = visibleSiblings.filter((id) => !movingIds.has(id));
  if (targetVisibleIndex < 0 || targetVisibleIndex > remainingVisible.length) {
    return null;
  }
  if (remainingVisible.length === 0) {
    return remainingChildren.length;
  }
  if (targetVisibleIndex === remainingVisible.length) {
    const lastVisible = remainingVisible[remainingVisible.length - 1];
    const lastIndex =
      lastVisible === undefined ? -1 : remainingChildren.indexOf(lastVisible);
    return lastIndex >= 0 ? lastIndex + 1 : remainingChildren.length;
  }
  const anchorId = remainingVisible[targetVisibleIndex];
  const anchorIndex =
    anchorId === undefined ? -1 : remainingChildren.indexOf(anchorId);
  if (anchorIndex < 0) {
    return remainingChildren.length;
  }
  return anchorIndex;
}
