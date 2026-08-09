import type { ReactNode } from "react";

import { isDenseArray } from "./runtime-option-validation.js";
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
}>;

export type ResolvedSortableItemTreeProps = Readonly<{
  ariaLabel: string;
  canContainChildren?: (itemId: string) => boolean;
  canMove?: (plan: ItemMovePlan) => boolean;
  disabled: boolean;
  getItemLabel(itemId: string): string;
  onMove(plan: ItemMovePlan): void;
  onSelectedItemIdsChange(itemIds: readonly string[]): void;
  renderItem(itemId: string): ReactNode;
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

export function resolveSortableItemTreeProps(
  props: SortableItemTreeProps,
): ResolvedSortableItemTreeProps {
  const index = createSortableItemTreeIndex(props.tree);
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
    selected.add(itemId);
  });
  const selectedItemIds = Object.freeze(index.itemOrder.filter((itemId) => selected.has(itemId)));
  const getItemLabel = (itemId: string) =>
    accessibleLabel(props.getItemLabel?.(itemId) ?? itemId, `Label for sortable item ${itemId}`);
  index.itemOrder.forEach(getItemLabel);
  const canContainChildren = containmentPolicy(props.canContainChildren, index);
  return {
    ariaLabel: accessibleLabel(props.ariaLabel ?? "Sortable items", "SortableItemTree ariaLabel"),
    ...(canContainChildren ? { canContainChildren } : {}),
    ...(props.canMove ? { canMove: props.canMove } : {}),
    disabled: props.disabled ?? false,
    getItemLabel,
    onMove: props.onMove,
    onSelectedItemIdsChange: props.onSelectedItemIdsChange,
    renderItem: props.renderItem,
    selectedItemIds,
    tree: props.tree,
  };
}
