import { denseArrayAt } from "./runtime-option-validation.js";
import { applySortableItemMove } from "./sortable-item-move-application.js";
import type { ItemMovePlan, SortableItemTree } from "./sortable-item-tree-contract.js";
import {
  createSortableItemTreeIndex,
  type SortableItemTreeIndex,
} from "./sortable-item-tree-validation.js";

export type SortableItemFilterProjection = Readonly<{
  canonicalTree: SortableItemTree;
  reconcilePlannedMove(plan: ItemMovePlan): ItemMovePlan;
  tree: SortableItemTree;
  visibleItemIds: readonly string[];
}>;

function visibleItemSet(value: unknown, index: SortableItemTreeIndex): ReadonlySet<string> {
  const candidates = denseArrayAt(value, "Filtered sortable item IDs");
  const visible = new Set<string>();
  candidates.forEach((candidate, itemIndex) => {
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
      throw new TypeError(
        `Filtered sortable item ID at index ${String(itemIndex)} must be a non-empty string.`,
      );
    }
    if (!index.parentByItem.has(candidate)) {
      throw new TypeError(`Filtered sortable item ID ${JSON.stringify(candidate)} is unknown.`);
    }
    if (visible.has(candidate)) {
      throw new TypeError(`Filtered sortable item ID ${JSON.stringify(candidate)} is duplicated.`);
    }
    visible.add(candidate);
  });
  for (const itemId of visible) {
    const parentId = index.parentByItem.get(itemId);
    if (parentId !== undefined && parentId !== index.rootId && !visible.has(parentId)) {
      throw new TypeError(
        `Filtered sortable item ${JSON.stringify(itemId)} requires visible ancestor ${JSON.stringify(parentId)}.`,
      );
    }
  }
  return visible;
}

function projectedChildren(
  index: SortableItemTreeIndex,
  visible: ReadonlySet<string>,
): Readonly<Record<string, readonly string[]>> {
  const entries: Array<readonly [string, readonly string[]]> = [];
  for (const [parentId, children] of index.childrenByParent) {
    if (parentId !== index.rootId && !visible.has(parentId)) continue;
    const next = children.filter((itemId) => visible.has(itemId));
    entries.push([parentId, next.length === children.length ? children : Object.freeze(next)]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

function projectedTree(
  tree: SortableItemTree,
  index: SortableItemTreeIndex,
  visible: ReadonlySet<string>,
): SortableItemTree {
  if (visible.size === index.itemOrder.length) return tree;
  return Object.freeze({
    childrenByParent: projectedChildren(index, visible),
    itemIds: Object.freeze(tree.itemIds.filter((itemId) => visible.has(itemId))),
    rootId: tree.rootId,
  });
}

function anchorIndex(
  canonicalChildren: readonly string[],
  previousItemId: string | undefined,
  nextItemId: string | undefined,
): number {
  if (nextItemId !== undefined) {
    const index = canonicalChildren.indexOf(nextItemId);
    if (index < 0)
      throw new Error("A visible destination anchor must exist in the canonical tree.");
    return index;
  }
  if (previousItemId !== undefined) {
    const index = canonicalChildren.indexOf(previousItemId);
    if (index < 0)
      throw new Error("A visible destination anchor must exist in the canonical tree.");
    return index + 1;
  }
  return canonicalChildren.length;
}

function canonicalDestinationIndex(
  canonicalIndex: SortableItemTreeIndex,
  filteredIndex: SortableItemTreeIndex,
  plan: ItemMovePlan,
): number {
  const moving = new Set(plan.itemIds);
  const filteredChildren = (
    filteredIndex.childrenByParent.get(plan.destinationParentId) ?? []
  ).filter((itemId) => !moving.has(itemId));
  const canonicalChildren = (
    canonicalIndex.childrenByParent.get(plan.destinationParentId) ?? []
  ).filter((itemId) => !moving.has(itemId));
  return anchorIndex(
    canonicalChildren,
    filteredChildren[plan.destinationIndex - 1],
    filteredChildren[plan.destinationIndex],
  );
}

function canonicalPlan(
  canonicalIndex: SortableItemTreeIndex,
  filteredIndex: SortableItemTreeIndex,
  plan: ItemMovePlan,
): ItemMovePlan {
  return Object.freeze({
    destinationIndex: canonicalDestinationIndex(canonicalIndex, filteredIndex, plan),
    destinationParentId: plan.destinationParentId,
    itemIds: Object.freeze([...plan.itemIds]),
    sourceParentIds: Object.freeze([...plan.sourceParentIds]),
  });
}

export function createSortableItemFilterProjection(
  tree: SortableItemTree,
  visibleItemIds: readonly string[],
): SortableItemFilterProjection {
  const canonicalIndex = createSortableItemTreeIndex(tree);
  const visible = visibleItemSet(visibleItemIds, canonicalIndex);
  const filteredTree = projectedTree(tree, canonicalIndex, visible);
  const filteredIndex = createSortableItemTreeIndex(filteredTree);
  const canonicalVisibleItemIds = Object.freeze(
    canonicalIndex.itemOrder.filter((itemId) => visible.has(itemId)),
  );
  return Object.freeze({
    canonicalTree: tree,
    reconcilePlannedMove: (plan) => canonicalPlan(canonicalIndex, filteredIndex, plan),
    tree: filteredTree,
    visibleItemIds: canonicalVisibleItemIds,
  });
}

export function createFilteredSortableItemTree(
  tree: SortableItemTree,
  visibleItemIds: readonly string[],
): SortableItemTree {
  return createSortableItemFilterProjection(tree, visibleItemIds).tree;
}

export function reconcileFilteredSortableItemMove(
  tree: SortableItemTree,
  visibleItemIds: readonly string[],
  plan: ItemMovePlan,
): ItemMovePlan {
  const projection = createSortableItemFilterProjection(tree, visibleItemIds);
  applySortableItemMove(projection.tree, plan);
  const reconciled = projection.reconcilePlannedMove(plan);
  applySortableItemMove(tree, reconciled);
  return reconciled;
}
