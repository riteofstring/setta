import { planSortableItemKeyboardMove } from "./sortable-item-keyboard-move.js";
import { applySortableItemMove, sortableItemTreesMatch } from "./sortable-item-move-application.js";
import { planSortableItemMove } from "./sortable-item-move-planning.js";
import type {
  ItemMovePlan,
  SortableItemDragBlock,
  SortableItemKeyboardCommand,
  SortableItemMoveDecision,
  SortableItemTree,
} from "./sortable-item-tree-contract.js";
import { createSortableItemTreeIndex } from "./sortable-item-tree-validation.js";

export type SortableItemPointerTarget =
  | Readonly<{
      itemId: string;
      rect: Readonly<{ height: number; top: number }>;
      type: "item";
    }>
  | Readonly<{ parentId: string; type: "parent" }>;

export type SortableItemPreview = Readonly<{
  destinationIndex: number;
  destinationParentId: string;
  plan: ItemMovePlan;
  projectedTree: SortableItemTree;
}>;

export type SortableItemPreviewResolution =
  | Readonly<{ preview: SortableItemPreview; status: "planned" }>
  | Readonly<{ reason: string; status: "rejected" }>
  | Readonly<{
      projectedTree?: SortableItemTree;
      reason: string;
      status: "unchanged";
    }>;

export function sortableItemMovePlansMatch(
  left: ItemMovePlan | null,
  right: ItemMovePlan | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  if (left.sourceParentId !== right.sourceParentId) return false;
  if (left.destinationParentId !== right.destinationParentId) return false;
  if (left.destinationIndex !== right.destinationIndex) return false;
  return (
    left.itemIds.length === right.itemIds.length &&
    left.itemIds.every((itemId, index) => itemId === right.itemIds[index])
  );
}

function itemAcceptsChildren(
  itemId: string,
  callback: ((itemId: string) => boolean) | undefined,
): boolean {
  if (!callback) {
    return true;
  }
  const accepted = callback(itemId);
  if (typeof accepted !== "boolean") {
    throw new TypeError("Sortable item canContainChildren must return a boolean.");
  }
  return accepted;
}

function rowDestination(
  tree: SortableItemTree,
  target: Extract<SortableItemPointerTarget, { type: "item" }>,
  clientY: number,
  canContainChildren: ((itemId: string) => boolean) | undefined,
): Readonly<{ index: number; parentId: string }> {
  const index = createSortableItemTreeIndex(tree);
  const relativeY = target.rect.height > 0 ? (clientY - target.rect.top) / target.rect.height : 0.5;
  if (
    relativeY >= 0.3 &&
    relativeY <= 0.7 &&
    itemAcceptsChildren(target.itemId, canContainChildren)
  ) {
    return {
      index: (index.childrenByParent.get(target.itemId) ?? []).length,
      parentId: target.itemId,
    };
  }
  const parentId = index.parentByItem.get(target.itemId);
  if (parentId === undefined) {
    throw new TypeError(`Sortable item target ${JSON.stringify(target.itemId)} is not placed.`);
  }
  const siblings = index.childrenByParent.get(parentId) ?? [];
  const itemIndex = siblings.indexOf(target.itemId);
  return { index: itemIndex + (relativeY >= 0.5 ? 1 : 0), parentId };
}

function pointerDestination(
  tree: SortableItemTree,
  target: SortableItemPointerTarget,
  clientY: number,
  canContainChildren: ((itemId: string) => boolean) | undefined,
): Readonly<{ index: number; parentId: string }> {
  if (target.type === "item") {
    return rowDestination(tree, target, clientY, canContainChildren);
  }
  const index = createSortableItemTreeIndex(tree);
  return {
    index: (index.childrenByParent.get(target.parentId) ?? []).length,
    parentId: target.parentId,
  };
}

function decisionResolution(
  decision: SortableItemMoveDecision,
  tree: SortableItemTree,
): SortableItemPreviewResolution {
  if (decision.status === "rejected") {
    return { reason: decision.reason, status: "rejected" };
  }
  if (decision.status === "unchanged") {
    return { reason: "The selected items are already at that position.", status: "unchanged" };
  }
  return {
    preview: {
      destinationIndex: decision.plan.destinationIndex,
      destinationParentId: decision.plan.destinationParentId,
      plan: decision.plan,
      projectedTree: applySortableItemMove(tree, decision.plan),
    },
    status: "planned",
  };
}

export function resolveSortableItemPointerPreview({
  activeItemId,
  block,
  canContainChildren,
  canMove,
  clientY,
  target,
  tree,
}: Readonly<{
  activeItemId: string;
  block: SortableItemDragBlock;
  canContainChildren?: (itemId: string) => boolean;
  canMove?: (plan: ItemMovePlan) => boolean;
  clientY: number;
  target: SortableItemPointerTarget;
  tree: SortableItemTree;
}>): SortableItemPreviewResolution {
  const destination = pointerDestination(tree, target, clientY, canContainChildren);
  return decisionResolution(
    planSortableItemMove({
      activeItemId,
      ...(canContainChildren ? { canContainChildren } : {}),
      ...(canMove ? { canMove } : {}),
      destinationIndex: destination.index,
      destinationParentId: destination.parentId,
      selectedItemIds: block.selectedItemIds,
      tree,
    }),
    tree,
  );
}

function rebasedPlan(
  originalTree: SortableItemTree,
  projectedTree: SortableItemTree,
  block: SortableItemDragBlock,
): ItemMovePlan {
  const projected = createSortableItemTreeIndex(projectedTree);
  const firstItemId = block.itemIds[0];
  const destinationParentId = firstItemId ? projected.parentByItem.get(firstItemId) : undefined;
  if (destinationParentId === undefined) {
    throw new TypeError("A sortable item keyboard block must contain one placed item.");
  }
  if (block.itemIds.some((itemId) => projected.parentByItem.get(itemId) !== destinationParentId)) {
    throw new TypeError("A sortable item keyboard block must remain under one parent.");
  }
  const moving = new Set(block.itemIds);
  const destinationChildren = projected.childrenByParent.get(destinationParentId) ?? [];
  const firstIndex = destinationChildren.findIndex((itemId) => moving.has(itemId));
  const destinationIndex = destinationChildren
    .slice(0, Math.max(0, firstIndex))
    .filter((itemId) => !moving.has(itemId)).length;
  const plan = Object.freeze({
    destinationIndex,
    destinationParentId,
    itemIds: Object.freeze([...block.itemIds]),
    sourceParentId: block.sourceParentId,
  });
  const applied = applySortableItemMove(originalTree, plan);
  if (!sortableItemTreesMatch(applied, projectedTree)) {
    throw new TypeError(
      "Sortable item keyboard projection cannot be represented by one move plan.",
    );
  }
  return plan;
}

function hostAccepts(
  callback: ((plan: ItemMovePlan) => boolean) | undefined,
  plan: ItemMovePlan,
): boolean {
  if (!callback) {
    return true;
  }
  const accepted = callback(plan);
  if (typeof accepted !== "boolean") {
    throw new TypeError("Sortable item canMove must return a boolean.");
  }
  return accepted;
}

export function resolveSortableItemKeyboardPreview({
  activeItemId,
  block,
  canContainChildren,
  canMove,
  command,
  originalTree,
  projectedTree,
}: Readonly<{
  activeItemId: string;
  block: SortableItemDragBlock;
  canContainChildren?: (itemId: string) => boolean;
  canMove?: (plan: ItemMovePlan) => boolean;
  command: SortableItemKeyboardCommand;
  originalTree: SortableItemTree;
  projectedTree: SortableItemTree;
}>): SortableItemPreviewResolution {
  const step = planSortableItemKeyboardMove({
    activeItemId,
    ...(canContainChildren ? { canContainChildren } : {}),
    command,
    selectedItemIds: block.selectedItemIds,
    tree: projectedTree,
  });
  if (step.status === "rejected") {
    return { reason: step.reason, status: "rejected" };
  }
  if (step.status === "unchanged") {
    return {
      projectedTree,
      reason: "The selected items cannot move farther in that direction.",
      status: "unchanged",
    };
  }
  const nextTree = applySortableItemMove(projectedTree, step.plan);
  const plan = rebasedPlan(originalTree, nextTree, block);
  if (sortableItemTreesMatch(nextTree, originalTree)) {
    return {
      projectedTree: nextTree,
      reason: "The selected items are back at their original position.",
      status: "unchanged",
    };
  }
  if (!hostAccepts(canMove, plan)) {
    return { reason: "The host rejected this item move.", status: "rejected" };
  }
  return {
    preview: {
      destinationIndex: plan.destinationIndex,
      destinationParentId: plan.destinationParentId,
      plan,
      projectedTree: nextTree,
    },
    status: "planned",
  };
}

export function sortableItemMoveStillAllowed({
  canContainChildren,
  canMove,
  plan,
  tree,
}: Readonly<{
  canContainChildren?: (itemId: string) => boolean;
  canMove?: (plan: ItemMovePlan) => boolean;
  plan: ItemMovePlan;
  tree: SortableItemTree;
}>): boolean {
  applySortableItemMove(tree, plan);
  const index = createSortableItemTreeIndex(tree);
  if (
    plan.destinationParentId !== index.rootId &&
    !itemAcceptsChildren(plan.destinationParentId, canContainChildren)
  ) {
    return false;
  }
  return hostAccepts(canMove, plan);
}
