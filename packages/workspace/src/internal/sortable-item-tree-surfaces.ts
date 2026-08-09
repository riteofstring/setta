import type { ReactNode } from "react";

import {
  sortableItemListPlanFromInternal,
  type SortableItemListsIndex,
} from "./sortable-item-lists.js";
import type { ItemMovePlan, SortableItemTree } from "./sortable-item-tree-contract.js";
import type {
  ResolvedSortableItemListsProps,
  ResolvedSortableItemTreeProps,
} from "./sortable-item-tree-react-contract.js";
import type { SortableItemSurfaceRoot } from "./sortable-item-tree-rendering.js";

export type ResolvedSortableItemSurfaceProps = Readonly<{
  ariaLabel: string;
  canonicalItemCount: number;
  canonicalTree: SortableItemTree;
  canContainChildren?: (itemId: string) => boolean;
  canMove?: (plan: ItemMovePlan) => boolean;
  destinationLabel(parentId: string): string;
  disabled: boolean;
  filtered: boolean;
  getItemLabel(itemId: string): string;
  onMove(plan: ItemMovePlan): void;
  onSelectedItemIdsChange(itemIds: readonly string[]): void;
  renderItem(itemId: string): ReactNode;
  roots: readonly SortableItemSurfaceRoot[];
  selectedItemIds: readonly string[];
  supportsListTransfer: boolean;
  tree: SortableItemTree;
  visibleItemCount: number;
}>;

function canonicalTreePlan(
  resolved: Pick<ResolvedSortableItemTreeProps, "filterProjection">,
  plan: ItemMovePlan,
): ItemMovePlan {
  return resolved.filterProjection?.reconcilePlannedMove(plan) ?? plan;
}

export function createSingleTreeSurfaceProps(
  resolved: ResolvedSortableItemTreeProps,
): ResolvedSortableItemSurfaceProps {
  const canMove = resolved.canMove
    ? (plan: ItemMovePlan) => resolved.canMove?.(canonicalTreePlan(resolved, plan)) ?? true
    : undefined;
  return {
    ariaLabel: resolved.ariaLabel,
    canonicalItemCount: resolved.canonicalTree.itemIds.length,
    canonicalTree: resolved.canonicalTree,
    ...(resolved.canContainChildren ? { canContainChildren: resolved.canContainChildren } : {}),
    ...(canMove ? { canMove } : {}),
    destinationLabel: (parentId) =>
      parentId === resolved.tree.rootId ? "the top level" : resolved.getItemLabel(parentId),
    disabled: resolved.disabled,
    filtered: resolved.filterProjection !== null,
    getItemLabel: resolved.getItemLabel,
    onMove: (plan) => resolved.onMove(canonicalTreePlan(resolved, plan)),
    onSelectedItemIdsChange: resolved.onSelectedItemIdsChange,
    renderItem: resolved.renderItem,
    roots: [{ label: "Top-level items", listId: null, parentId: resolved.tree.rootId }],
    selectedItemIds: resolved.selectedItemIds,
    supportsListTransfer: false,
    tree: resolved.tree,
    visibleItemCount: resolved.tree.itemIds.length,
  };
}

function itemListId(index: SortableItemListsIndex, itemId: string): string {
  const listId = index.itemListIdByItem.get(itemId);
  if (!listId) {
    throw new TypeError(`Sortable item ${JSON.stringify(itemId)} is not in a named list.`);
  }
  return listId;
}

function canonicalListPlan(
  index: SortableItemListsIndex,
  resolved: ResolvedSortableItemListsProps,
  plan: ItemMovePlan,
) {
  const canonical = resolved.filterProjection?.reconcilePlannedMove(plan) ?? plan;
  return sortableItemListPlanFromInternal(index, canonical);
}

export function createNamedListsSurfaceProps(
  index: SortableItemListsIndex,
  resolved: ResolvedSortableItemListsProps,
): ResolvedSortableItemSurfaceProps {
  const labelBySyntheticRoot = new Map(
    index.roots.map((root) => [root.syntheticRootId, root.label] as const),
  );
  const canContainChildren = resolved.canContainChildren
    ? (itemId: string) => {
        if (index.listIdBySyntheticRoot.has(itemId)) return true;
        return resolved.canContainChildren?.(itemId, itemListId(index, itemId)) ?? true;
      }
    : undefined;
  const canMove = (plan: ItemMovePlan) => {
    if (plan.destinationParentId === index.aggregateRootId) return false;
    return resolved.canMove?.(canonicalListPlan(index, resolved, plan)) ?? true;
  };
  return {
    ariaLabel: resolved.ariaLabel,
    canonicalItemCount: index.itemListIdByItem.size,
    canonicalTree: resolved.canonicalTree,
    ...(canContainChildren ? { canContainChildren } : {}),
    canMove,
    destinationLabel: (parentId) => {
      const rootLabel = labelBySyntheticRoot.get(parentId);
      return rootLabel
        ? `the ${rootLabel} list`
        : resolved.getItemLabel(parentId, itemListId(index, parentId));
    },
    disabled: resolved.disabled,
    filtered: resolved.filterProjection !== null,
    getItemLabel: (itemId) => {
      const rootLabel = labelBySyntheticRoot.get(itemId);
      return rootLabel ?? resolved.getItemLabel(itemId, itemListId(index, itemId));
    },
    onMove: (plan) => resolved.onMove(canonicalListPlan(index, resolved, plan)),
    onSelectedItemIdsChange: resolved.onSelectedItemIdsChange,
    renderItem: (itemId) => resolved.renderItem(itemId, itemListId(index, itemId)),
    roots: index.roots.map((root) => ({
      label: root.label,
      listId: root.listId,
      parentId: root.syntheticRootId,
    })),
    selectedItemIds: resolved.selectedItemIds,
    supportsListTransfer: index.roots.length > 1,
    tree: resolved.tree,
    visibleItemCount: resolved.tree.itemIds.filter((itemId) => index.itemListIdByItem.has(itemId))
      .length,
  };
}
