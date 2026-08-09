import { isDenseArray } from "./runtime-option-validation.js";
import type {
  SortableItemDragBlock,
  SortableItemSelectionMode,
  SortableItemTree,
} from "./sortable-item-tree-contract.js";
import {
  createSortableItemTreeIndex,
  type SortableItemTreeIndex,
} from "./sortable-item-tree-validation.js";

function knownItemId(itemId: unknown, index: SortableItemTreeIndex, label: string): string {
  if (typeof itemId !== "string" || itemId.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  if (!index.parentByItem.has(itemId)) {
    throw new TypeError(`${label} "${itemId}" is not in the sortable item tree.`);
  }
  return itemId;
}

function selectionSet(
  selectedItemIds: readonly string[],
  index: SortableItemTreeIndex,
): Set<string> {
  if (!isDenseArray(selectedItemIds)) {
    throw new TypeError("Sortable item selection must be a dense array without extra fields.");
  }
  const selected = new Set<string>();
  selectedItemIds.forEach((itemId, selectionIndex) => {
    selected.add(
      knownItemId(itemId, index, `Sortable item selection at index ${String(selectionIndex)}`),
    );
  });
  return selected;
}

function canonicalSelection(selected: ReadonlySet<string>, index: SortableItemTreeIndex) {
  return Object.freeze(index.itemOrder.filter((itemId) => selected.has(itemId)));
}

function hasSelectedAncestor(
  itemId: string,
  selected: ReadonlySet<string>,
  index: SortableItemTreeIndex,
): boolean {
  let parentId = index.parentByItem.get(itemId);
  while (parentId !== undefined && parentId !== index.rootId) {
    if (selected.has(parentId)) {
      return true;
    }
    parentId = index.parentByItem.get(parentId);
  }
  return false;
}

function normalizedRoots(
  selected: ReadonlySet<string>,
  index: SortableItemTreeIndex,
): readonly string[] {
  return Object.freeze(
    index.itemOrder.filter(
      (itemId) => selected.has(itemId) && !hasSelectedAncestor(itemId, selected, index),
    ),
  );
}

export function resolveSortableItemSelectionChange(
  tree: SortableItemTree,
  selectedItemIds: readonly string[],
  itemId: string,
  mode: SortableItemSelectionMode,
): readonly string[] {
  const index = createSortableItemTreeIndex(tree);
  const activeItemId = knownItemId(itemId, index, "Sortable item ID");
  const selected = selectionSet(selectedItemIds, index);
  if (mode === "replace") {
    return Object.freeze([activeItemId]);
  }
  if (mode !== "toggle") {
    throw new TypeError('Sortable item selection mode must be "replace" or "toggle".');
  }
  if (selected.has(activeItemId)) {
    selected.delete(activeItemId);
  } else {
    selected.add(activeItemId);
  }
  return canonicalSelection(selected, index);
}

export function normalizeSortableItemSelectionRoots(
  tree: SortableItemTree,
  selectedItemIds: readonly string[],
): readonly string[] {
  const index = createSortableItemTreeIndex(tree);
  return normalizedRoots(selectionSet(selectedItemIds, index), index);
}

export function resolveSortableItemDragBlock(
  tree: SortableItemTree,
  selectedItemIds: readonly string[],
  activeItemId: string,
): SortableItemDragBlock {
  return resolveSortableItemDragBlockFromIndex(
    createSortableItemTreeIndex(tree),
    selectedItemIds,
    activeItemId,
  );
}

export function resolveSortableItemDragBlockFromIndex(
  index: SortableItemTreeIndex,
  selectedItemIds: readonly string[],
  activeItemId: string,
): SortableItemDragBlock {
  const activeId = knownItemId(activeItemId, index, "Active sortable item ID");
  const selected = selectionSet(selectedItemIds, index);
  if (!selected.has(activeId)) {
    return dragBlock([activeId], [activeId], index);
  }
  const selectedRoots = normalizedRoots(selected, index);
  return dragBlock(selectedRoots, canonicalSelection(selected, index), index);
}

function dragBlock(
  itemIds: readonly string[],
  selectedItemIds: readonly string[],
  index: SortableItemTreeIndex,
): SortableItemDragBlock {
  if (itemIds.length === 0) {
    throw new TypeError("A sortable item drag block must contain at least one placed item.");
  }
  const sourceParentIds = itemIds.map((itemId) => {
    const parentId = index.parentByItem.get(itemId);
    if (parentId === undefined) {
      throw new TypeError(`Sortable item ${JSON.stringify(itemId)} is not placed.`);
    }
    return parentId;
  });
  return Object.freeze({
    itemIds: Object.freeze([...itemIds]),
    selectedItemIds: Object.freeze([...selectedItemIds]),
    sourceParentIds: Object.freeze(sourceParentIds),
  });
}

export function resolveSortableItemDragAnchor(
  index: SortableItemTreeIndex,
  block: SortableItemDragBlock,
  activeItemId: string,
): Readonly<{ itemId: string; parentId: string }> {
  const moving = new Set(block.itemIds);
  let itemId = knownItemId(activeItemId, index, "Active sortable item ID");
  while (!moving.has(itemId)) {
    const parentId = index.parentByItem.get(itemId);
    if (parentId === undefined || parentId === index.rootId) {
      throw new TypeError("The active sortable item is outside the normalized movement block.");
    }
    itemId = parentId;
  }
  const itemIndex = block.itemIds.indexOf(itemId);
  const parentId = block.sourceParentIds[itemIndex];
  if (!parentId) {
    throw new TypeError("The active sortable item movement root has no source parent.");
  }
  return Object.freeze({ itemId, parentId });
}
