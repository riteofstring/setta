import { buildItemParentMap, getItemOrThrow } from "./itemTree.js";
import { assertValidWorkspaceSectionItemTree } from "./itemTreeValidation.js";
import type { WorkspaceItem, WorkspaceSectionItemTree } from "./types.js";

type PreparedWorkspaceItemInsertion = {
  itemTree: WorkspaceSectionItemTree;
  insertedItemId: string;
  focusTargetId: string;
};

type PreparedWorkspaceItemDeletion = {
  itemTree: WorkspaceSectionItemTree;
  deletedItemIds: Array<string>;
  focusTargetId: string | null;
};

function getItemTreeOrder(itemTree: WorkspaceSectionItemTree): Array<string> {
  const order: Array<string> = [];

  function walk(parentId: string): void {
    for (const childId of getItemOrThrow(itemTree, parentId).children) {
      order.push(childId);
      walk(childId);
    }
  }

  walk(itemTree.rootId);
  return order;
}

export function prepareWorkspaceItemInsertion(
  sectionId: string,
  itemTree: WorkspaceSectionItemTree,
  item: WorkspaceItem,
): PreparedWorkspaceItemInsertion {
  if (item === null || typeof item !== "object") {
    throw new Error(
      `Section ${sectionId} item factory must return an item object.`,
    );
  }
  if (typeof item.id !== "string" || item.id.trim() === "") {
    throw new Error(
      `Section ${sectionId} item factory must return a nonblank item id.`,
    );
  }
  if (Object.hasOwn(itemTree.items, item.id)) {
    throw new Error(
      `Section ${sectionId} item factory returned duplicate item id ${item.id}.`,
    );
  }
  if (!Array.isArray(item.children) || item.children.length !== 0) {
    throw new Error(
      `Section ${sectionId} item factory must return an item with no children; ` +
        "the package owns insertion placement.",
    );
  }

  const root = getItemOrThrow(itemTree, itemTree.rootId);
  const candidateTree: WorkspaceSectionItemTree = {
    ...itemTree,
    items: {
      ...itemTree.items,
      [item.id]: item,
      [itemTree.rootId]: { ...root, children: [...root.children, item.id] },
    },
    selectedItemIds: [item.id],
  };
  assertValidWorkspaceSectionItemTree(sectionId, candidateTree);

  const detachedItem = structuredClone(item);
  return {
    itemTree: {
      ...candidateTree,
      items: { ...candidateTree.items, [item.id]: detachedItem },
    },
    insertedItemId: item.id,
    focusTargetId: item.id,
  };
}

function collectDeletedItemIds(
  itemTree: WorkspaceSectionItemTree,
  rootItemIds: ReadonlyArray<string>,
): Set<string> {
  const deleted = new Set<string>();

  function walk(itemId: string): void {
    if (deleted.has(itemId)) {
      return;
    }
    deleted.add(itemId);
    for (const childId of getItemOrThrow(itemTree, itemId).children) {
      walk(childId);
    }
  }

  for (const itemId of rootItemIds) {
    walk(itemId);
  }
  return deleted;
}

function getDeletionRoots(
  itemTree: WorkspaceSectionItemTree,
  itemIds: ReadonlyArray<string>,
): Array<string> {
  const parentById = buildItemParentMap(itemTree);
  const requested = new Set(itemIds);
  return itemIds.filter((itemId) => {
    let parentId = parentById[itemId] ?? null;
    while (parentId !== null) {
      if (requested.has(parentId)) {
        return false;
      }
      parentId = parentById[parentId] ?? null;
    }
    return true;
  });
}

function resolveDeletionFocusTarget(
  order: ReadonlyArray<string>,
  deleted: ReadonlySet<string>,
  survivingSelectedIds: ReadonlyArray<string>,
): string | null {
  if (survivingSelectedIds.length > 0) {
    return survivingSelectedIds[0] ?? null;
  }
  const firstDeletedIndex = order.findIndex((itemId) => deleted.has(itemId));
  const survivors = order.filter((itemId) => !deleted.has(itemId));
  return (
    survivors[firstDeletedIndex] ?? survivors[firstDeletedIndex - 1] ?? null
  );
}

function assertValidDeletionRequest(
  sectionId: string,
  itemTree: WorkspaceSectionItemTree,
  itemIds: ReadonlyArray<string>,
): void {
  const requested = new Set<string>();
  for (const itemId of itemIds) {
    if (requested.has(itemId)) {
      throw new Error(
        `Section ${sectionId} item deletion lists ${itemId} twice.`,
      );
    }
    requested.add(itemId);
    if (itemId === itemTree.rootId) {
      throw new Error(
        `Section ${sectionId} cannot delete its root item ${itemId}.`,
      );
    }
    if (!Object.hasOwn(itemTree.items, itemId)) {
      throw new Error(
        `Section ${sectionId} cannot delete unknown item ${itemId}.`,
      );
    }
  }
}

function removeDeletedItems(
  itemTree: WorkspaceSectionItemTree,
  deleted: ReadonlySet<string>,
): Record<string, WorkspaceItem> {
  const nextItems: Record<string, WorkspaceItem> = {};
  for (const [itemId, item] of Object.entries(itemTree.items)) {
    if (deleted.has(itemId)) {
      continue;
    }
    const children = item.children.filter((childId) => !deleted.has(childId));
    nextItems[itemId] =
      children.length === item.children.length ? item : { ...item, children };
  }
  return nextItems;
}

function resolveDeletionSelection(
  survivingSelectedIds: Array<string>,
  focusTargetId: string | null,
): Array<string> {
  if (survivingSelectedIds.length > 0) {
    return survivingSelectedIds;
  }
  return focusTargetId ? [focusTargetId] : [];
}

export function prepareWorkspaceItemDeletion(
  sectionId: string,
  itemTree: WorkspaceSectionItemTree,
  itemIds: ReadonlyArray<string>,
): PreparedWorkspaceItemDeletion {
  assertValidWorkspaceSectionItemTree(sectionId, itemTree);
  if (itemIds.length === 0) {
    return { itemTree, deletedItemIds: [], focusTargetId: null };
  }

  assertValidDeletionRequest(sectionId, itemTree, itemIds);

  const order = getItemTreeOrder(itemTree);
  const deleted = collectDeletedItemIds(
    itemTree,
    getDeletionRoots(itemTree, itemIds),
  );
  const deletedItemIds = order.filter((itemId) => deleted.has(itemId));
  const survivingSelectedIds = itemTree.selectedItemIds.filter(
    (itemId) => !deleted.has(itemId),
  );
  const focusTargetId = resolveDeletionFocusTarget(
    order,
    deleted,
    survivingSelectedIds,
  );
  const nextItemTree: WorkspaceSectionItemTree = {
    ...itemTree,
    items: removeDeletedItems(itemTree, deleted),
    selectedItemIds: resolveDeletionSelection(
      survivingSelectedIds,
      focusTargetId,
    ),
  };
  assertValidWorkspaceSectionItemTree(sectionId, nextItemTree);
  return { itemTree: nextItemTree, deletedItemIds, focusTargetId };
}
