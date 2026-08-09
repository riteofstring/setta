import type { ReactNode } from "react";

import { denseArrayAt, isDenseArray } from "./runtime-option-validation.js";
import {
  createSortableItemFilterProjection,
  type SortableItemFilterProjection,
} from "./sortable-item-filtering.js";
import type {
  SortableItemList,
  SortableItemListMovePlan,
  SortableItemListsIndex,
} from "./sortable-item-lists.js";
import type { ItemMovePlan, SortableItemTree } from "./sortable-item-tree-contract.js";
import {
  createSortableItemTreeIndex,
  type SortableItemTreeIndex,
} from "./sortable-item-tree-validation.js";

export type SortableItemTreeProps = Readonly<{
  ariaLabel?: string;
  canContainChildren?: (itemId: string) => boolean;
  canMove?: (plan: ItemMovePlan) => boolean;
  disabled?: boolean;
  getItemLabel?: (itemId: string) => string;
  onMove(plan: ItemMovePlan): void;
  onSelectedItemIdsChange(itemIds: readonly string[]): void;
  renderItem(itemId: string): ReactNode;
  selectedItemIds: readonly string[];
  tree: SortableItemTree;
  visibleItemIds?: readonly string[];
}>;

export type SortableItemListsProps = Readonly<{
  ariaLabel?: string;
  canContainChildren?: (itemId: string, listId: string) => boolean;
  canMove?: (plan: SortableItemListMovePlan) => boolean;
  disabled?: boolean;
  getItemLabel?: (itemId: string, listId: string) => string;
  lists: readonly SortableItemList[];
  onMove(plan: SortableItemListMovePlan): void;
  onSelectedItemIdsChange(itemIds: readonly string[]): void;
  renderItem(itemId: string, listId: string): ReactNode;
  selectedItemIds: readonly string[];
  visibleItemIds?: readonly string[];
}>;

export type ResolvedSortableItemTreeProps = Readonly<{
  ariaLabel: string;
  canonicalTree: SortableItemTree;
  canContainChildren?: (itemId: string) => boolean;
  canMove?: (plan: ItemMovePlan) => boolean;
  disabled: boolean;
  filterProjection: SortableItemFilterProjection | null;
  getItemLabel(itemId: string): string;
  onMove(plan: ItemMovePlan): void;
  onSelectedItemIdsChange(itemIds: readonly string[]): void;
  renderItem(itemId: string): ReactNode;
  selectedItemIds: readonly string[];
  tree: SortableItemTree;
}>;

export type ResolvedSortableItemListsProps = Readonly<{
  ariaLabel: string;
  canonicalTree: SortableItemTree;
  canContainChildren?: (itemId: string, listId: string) => boolean;
  canMove?: (plan: SortableItemListMovePlan) => boolean;
  disabled: boolean;
  filterProjection: SortableItemFilterProjection | null;
  getItemLabel(itemId: string, listId: string): string;
  lists: readonly SortableItemList[];
  onMove(plan: SortableItemListMovePlan): void;
  onSelectedItemIdsChange(itemIds: readonly string[]): void;
  renderItem(itemId: string, listId: string): ReactNode;
  selectedItemIds: readonly string[];
  tree: SortableItemTree;
}>;

function requiredCallback(value: unknown, label: string): void {
  if (typeof value !== "function") {
    throw new TypeError(`${label} must be a function.`);
  }
}

function optionalCallback(value: unknown, label: string): void {
  if (value !== undefined) {
    requiredCallback(value, label);
  }
}

function accessibleLabel(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function containmentPolicy(
  callback: ((itemId: string) => boolean) | undefined,
  index: SortableItemTreeIndex,
): ((itemId: string) => boolean) | undefined {
  if (!callback) return undefined;
  const acceptedItemIds = new Set<string>();
  for (const itemId of index.itemOrder) {
    const accepted = callback(itemId);
    if (typeof accepted !== "boolean") {
      throw new TypeError("SortableItemTree canContainChildren must return a boolean.");
    }
    if (!accepted && (index.childrenByParent.get(itemId)?.length ?? 0) > 0) {
      throw new TypeError(
        `SortableItemTree item ${JSON.stringify(itemId)} has children but canContainChildren rejected it.`,
      );
    }
    if (accepted) acceptedItemIds.add(itemId);
  }
  return (itemId: string) => acceptedItemIds.has(itemId);
}

function resolvedTreeContract(
  props: SortableItemTreeProps,
  filterProjection: SortableItemFilterProjection | null,
  getItemLabel: ResolvedSortableItemTreeProps["getItemLabel"],
  selectedItemIds: readonly string[],
  canContainChildren: ResolvedSortableItemTreeProps["canContainChildren"],
): ResolvedSortableItemTreeProps {
  return {
    ariaLabel: accessibleLabel(props.ariaLabel ?? "Sortable items", "SortableItemTree ariaLabel"),
    canonicalTree: props.tree,
    ...(canContainChildren ? { canContainChildren } : {}),
    ...(props.canMove ? { canMove: props.canMove } : {}),
    disabled: props.disabled ?? false,
    filterProjection,
    getItemLabel,
    onMove: props.onMove,
    onSelectedItemIdsChange: props.onSelectedItemIdsChange,
    renderItem: props.renderItem,
    selectedItemIds,
    tree: filterProjection?.tree ?? props.tree,
  };
}

export function resolveSortableItemTreeProps(
  props: SortableItemTreeProps,
): ResolvedSortableItemTreeProps {
  const index = createSortableItemTreeIndex(props.tree);
  const filterProjection =
    props.visibleItemIds === undefined
      ? null
      : createSortableItemFilterProjection(props.tree, props.visibleItemIds);
  const visible = filterProjection
    ? new Set(filterProjection.visibleItemIds)
    : new Set(index.itemOrder);
  requiredCallback(props.onMove, "SortableItemTree onMove");
  requiredCallback(props.onSelectedItemIdsChange, "SortableItemTree onSelectedItemIdsChange");
  requiredCallback(props.renderItem, "SortableItemTree renderItem");
  optionalCallback(props.canContainChildren, "SortableItemTree canContainChildren");
  optionalCallback(props.canMove, "SortableItemTree canMove");
  optionalCallback(props.getItemLabel, "SortableItemTree getItemLabel");
  if (props.disabled !== undefined && typeof props.disabled !== "boolean") {
    throw new TypeError("SortableItemTree disabled must be a boolean.");
  }
  if (!isDenseArray(props.selectedItemIds)) {
    throw new TypeError("SortableItemTree selectedItemIds must be a dense array.");
  }
  const selected = new Set<string>();
  props.selectedItemIds.forEach((itemId) => {
    if (typeof itemId !== "string" || !index.parentByItem.has(itemId)) {
      throw new TypeError("SortableItemTree selectedItemIds must contain only known item IDs.");
    }
    if (!visible.has(itemId)) {
      throw new TypeError(
        "SortableItemTree selectedItemIds must contain only visible item IDs while filtered.",
      );
    }
    selected.add(itemId);
  });
  const selectedItemIds = Object.freeze(index.itemOrder.filter((itemId) => selected.has(itemId)));
  const getItemLabel = (itemId: string) =>
    accessibleLabel(props.getItemLabel?.(itemId) ?? itemId, `Label for sortable item ${itemId}`);
  index.itemOrder.forEach(getItemLabel);
  const canContainChildren = containmentPolicy(props.canContainChildren, index);
  return resolvedTreeContract(
    props,
    filterProjection,
    getItemLabel,
    selectedItemIds,
    canContainChildren,
  );
}

function listContainmentPolicy(
  callback: SortableItemListsProps["canContainChildren"],
  index: SortableItemListsIndex,
): SortableItemListsProps["canContainChildren"] {
  if (!callback) return undefined;
  const acceptedItemIds = new Set<string>();
  const treeIndexByList = new Map(
    index.roots.map(
      (root) =>
        [root.listId, createSortableItemTreeIndex(requiredList(index, root.listId).tree)] as const,
    ),
  );
  for (const [itemId, listId] of index.itemListIdByItem) {
    const accepted = callback(itemId, listId);
    if (typeof accepted !== "boolean") {
      throw new TypeError("SortableItemLists canContainChildren must return a boolean.");
    }
    if (!accepted && listItemHasChildren(treeIndexByList, listId, itemId)) {
      throw new TypeError(
        `SortableItemLists item ${JSON.stringify(itemId)} has children but canContainChildren rejected it.`,
      );
    }
    if (accepted) acceptedItemIds.add(itemId);
  }
  return (itemId: string) => acceptedItemIds.has(itemId);
}

function requiredList(index: SortableItemListsIndex, listId: string) {
  const list = index.listById.get(listId);
  if (!list) throw new Error("A validated sortable item list must remain available.");
  return list;
}

function listItemHasChildren(
  treeIndexByList: ReadonlyMap<string, SortableItemTreeIndex>,
  listId: string,
  itemId: string,
): boolean {
  const treeIndex = treeIndexByList.get(listId);
  if (!treeIndex) throw new Error("A validated sortable item list must have a tree index.");
  return (treeIndex.childrenByParent.get(itemId)?.length ?? 0) > 0;
}

function resolvedListSelection(
  value: unknown,
  index: SortableItemListsIndex,
  visible: ReadonlySet<string>,
): readonly string[] {
  if (!isDenseArray(value)) {
    throw new TypeError("SortableItemLists selectedItemIds must be a dense array.");
  }
  const selected = new Set<string>();
  value.forEach((itemId) => {
    if (typeof itemId !== "string" || !index.itemListIdByItem.has(itemId)) {
      throw new TypeError("SortableItemLists selectedItemIds must contain only known item IDs.");
    }
    if (!visible.has(itemId)) {
      throw new TypeError(
        "SortableItemLists selectedItemIds must contain only visible item IDs while filtered.",
      );
    }
    selected.add(itemId);
  });
  const order = index.roots.flatMap(
    (root) => createSortableItemTreeIndex(requiredList(index, root.listId).tree).itemOrder,
  );
  return Object.freeze(order.filter((itemId) => selected.has(itemId)));
}

function listFilterProjection(
  value: unknown,
  index: SortableItemListsIndex,
): SortableItemFilterProjection | null {
  if (value === undefined) return null;
  const candidates = denseArrayAt(value, "SortableItemLists visibleItemIds");
  const visible = new Set<string>();
  candidates.forEach((candidate, itemIndex) => {
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
      throw new TypeError(
        `SortableItemLists visibleItemIds at index ${String(itemIndex)} must be a non-empty string.`,
      );
    }
    if (!index.itemListIdByItem.has(candidate)) {
      throw new TypeError(
        `SortableItemLists visibleItemId ${JSON.stringify(candidate)} is unknown.`,
      );
    }
    if (visible.has(candidate)) {
      throw new TypeError(
        `SortableItemLists visibleItemId ${JSON.stringify(candidate)} is duplicated.`,
      );
    }
    visible.add(candidate);
  });
  return createSortableItemFilterProjection(index.aggregateTree, [
    ...index.roots.map((root) => root.syntheticRootId),
    ...visible,
  ]);
}

function resolvedListLabels(
  callback: SortableItemListsProps["getItemLabel"],
  index: SortableItemListsIndex,
): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  for (const [itemId, listId] of index.itemListIdByItem) {
    labels.set(
      itemId,
      accessibleLabel(callback?.(itemId, listId) ?? itemId, `Label for sortable item ${itemId}`),
    );
  }
  return labels;
}

function requiredListItemLabel(labels: ReadonlyMap<string, string>, itemId: string): string {
  const label = labels.get(itemId);
  if (!label) throw new TypeError(`Sortable item ${JSON.stringify(itemId)} is unknown.`);
  return label;
}

function resolvedListsContract(
  props: SortableItemListsProps,
  index: SortableItemListsIndex,
  filterProjection: SortableItemFilterProjection | null,
  labels: ReadonlyMap<string, string>,
  selectedItemIds: readonly string[],
  canContainChildren: ResolvedSortableItemListsProps["canContainChildren"],
): ResolvedSortableItemListsProps {
  return {
    ariaLabel: accessibleLabel(
      props.ariaLabel ?? "Sortable item lists",
      "SortableItemLists ariaLabel",
    ),
    canonicalTree: index.aggregateTree,
    ...(canContainChildren ? { canContainChildren } : {}),
    ...(props.canMove ? { canMove: props.canMove } : {}),
    disabled: props.disabled ?? false,
    filterProjection,
    getItemLabel: (itemId: string) => requiredListItemLabel(labels, itemId),
    lists: props.lists,
    onMove: props.onMove,
    onSelectedItemIdsChange: props.onSelectedItemIdsChange,
    renderItem: props.renderItem,
    selectedItemIds,
    tree: filterProjection?.tree ?? index.aggregateTree,
  };
}

export function resolveSortableItemListsProps(
  props: SortableItemListsProps,
  index: SortableItemListsIndex,
): ResolvedSortableItemListsProps {
  requiredCallback(props.onMove, "SortableItemLists onMove");
  requiredCallback(props.onSelectedItemIdsChange, "SortableItemLists onSelectedItemIdsChange");
  requiredCallback(props.renderItem, "SortableItemLists renderItem");
  optionalCallback(props.canContainChildren, "SortableItemLists canContainChildren");
  optionalCallback(props.canMove, "SortableItemLists canMove");
  optionalCallback(props.getItemLabel, "SortableItemLists getItemLabel");
  if (props.disabled !== undefined && typeof props.disabled !== "boolean") {
    throw new TypeError("SortableItemLists disabled must be a boolean.");
  }
  const filterProjection = listFilterProjection(props.visibleItemIds, index);
  const visible = new Set(
    filterProjection
      ? filterProjection.visibleItemIds.filter((itemId) => index.itemListIdByItem.has(itemId))
      : index.itemListIdByItem.keys(),
  );
  const selectedItemIds = resolvedListSelection(props.selectedItemIds, index, visible);
  const labels = resolvedListLabels(props.getItemLabel, index);
  const canContainChildren = listContainmentPolicy(props.canContainChildren, index);
  return resolvedListsContract(
    props,
    index,
    filterProjection,
    labels,
    selectedItemIds,
    canContainChildren,
  );
}
