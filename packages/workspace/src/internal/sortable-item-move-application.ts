import { isDenseArray, optionOverridesAt } from "./runtime-option-validation.js";
import type { ItemMovePlan, SortableItemTree } from "./sortable-item-tree-contract.js";
import {
  createSortableItemTreeIndex,
  type SortableItemTreeIndex,
} from "./sortable-item-tree-validation.js";

const planKeys = ["destinationIndex", "destinationParentId", "itemIds", "sourceParentId"] as const;

type ValidatedItemMove = Readonly<{
  destinationChildren: readonly string[];
  index: SortableItemTreeIndex;
  itemIds: readonly string[];
  plan: ItemMovePlan;
  sourceChildren: readonly string[];
}>;

function nonEmptyId(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function planItemIds(value: unknown, index: SortableItemTreeIndex): readonly string[] {
  if (!isDenseArray(value) || value.length === 0) {
    throw new TypeError("Sortable item move plan itemIds must be a non-empty dense array.");
  }
  const seen = new Set<string>();
  return Object.freeze(
    value.map((candidate, itemIndex) => {
      const itemId = nonEmptyId(
        candidate,
        `Sortable item move plan itemIds at index ${String(itemIndex)}`,
      );
      if (!index.parentByItem.has(itemId)) {
        throw new TypeError(`Sortable item move plan item ${JSON.stringify(itemId)} is unknown.`);
      }
      if (seen.has(itemId)) {
        throw new TypeError(
          `Sortable item move plan item ${JSON.stringify(itemId)} is duplicated.`,
        );
      }
      seen.add(itemId);
      return itemId;
    }),
  );
}

function knownParent(value: unknown, index: SortableItemTreeIndex, label: string): string {
  const parentId = nonEmptyId(value, label);
  if (parentId !== index.rootId && !index.parentByItem.has(parentId)) {
    throw new TypeError(`${label} ${JSON.stringify(parentId)} is unknown.`);
  }
  return parentId;
}

function validateSourceOrder(
  itemIds: readonly string[],
  sourceParentId: string,
  sourceChildren: readonly string[],
  index: SortableItemTreeIndex,
): void {
  if (itemIds.some((itemId) => index.parentByItem.get(itemId) !== sourceParentId)) {
    throw new TypeError("Sortable item move plan items must share the declared source parent.");
  }
  const moving = new Set(itemIds);
  const canonical = sourceChildren.filter((itemId) => moving.has(itemId));
  if (!arraysEqual(canonical, itemIds)) {
    throw new TypeError("Sortable item move plan items must follow canonical sibling order.");
  }
}

function validateDestinationIndex(
  value: unknown,
  destinationChildren: readonly string[],
  itemIds: readonly string[],
  sameParent: boolean,
): number {
  const moving = new Set(itemIds);
  const maximum = sameParent
    ? destinationChildren.filter((itemId) => !moving.has(itemId)).length
    : destinationChildren.length;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > maximum) {
    throw new TypeError(
      `Sortable item move plan destinationIndex must be an integer from 0 through ${String(maximum)}.`,
    );
  }
  return value;
}

function validateNoCycle(
  destinationParentId: string,
  itemIds: readonly string[],
  index: SortableItemTreeIndex,
): void {
  const moving = new Set(itemIds);
  let currentId = destinationParentId;
  while (currentId !== index.rootId) {
    if (moving.has(currentId)) {
      throw new TypeError("Sortable item move plan cannot move an item into its own subtree.");
    }
    const parentId = index.parentByItem.get(currentId);
    if (parentId === undefined) {
      return;
    }
    currentId = parentId;
  }
}

function validateItemMove(tree: SortableItemTree, value: ItemMovePlan): ValidatedItemMove {
  const index = createSortableItemTreeIndex(tree);
  const record = optionOverridesAt(
    value,
    planKeys,
    "Sortable item move plan",
    "sortable item move plan field",
  );
  const itemIds = planItemIds(record.itemIds, index);
  const sourceParentId = knownParent(
    record.sourceParentId,
    index,
    "Sortable item move plan sourceParentId",
  );
  const destinationParentId = knownParent(
    record.destinationParentId,
    index,
    "Sortable item move plan destinationParentId",
  );
  const sourceChildren = index.childrenByParent.get(sourceParentId) ?? [];
  const destinationChildren = index.childrenByParent.get(destinationParentId) ?? [];
  validateSourceOrder(itemIds, sourceParentId, sourceChildren, index);
  const destinationIndex = validateDestinationIndex(
    record.destinationIndex,
    destinationChildren,
    itemIds,
    sourceParentId === destinationParentId,
  );
  validateNoCycle(destinationParentId, itemIds, index);
  return {
    destinationChildren,
    index,
    itemIds,
    plan: Object.freeze({
      destinationIndex,
      destinationParentId,
      itemIds,
      sourceParentId,
    }),
    sourceChildren,
  };
}

function nextParentChildren(
  current: readonly string[],
  moving: ReadonlySet<string>,
  insertionIndex: number | null,
  itemIds: readonly string[],
): readonly string[] {
  const remaining = current.filter((itemId) => !moving.has(itemId));
  if (insertionIndex === null) {
    return Object.freeze(remaining);
  }
  return Object.freeze([
    ...remaining.slice(0, insertionIndex),
    ...itemIds,
    ...remaining.slice(insertionIndex),
  ]);
}

function childrenRecord(
  tree: SortableItemTree,
  index: SortableItemTreeIndex,
  updates: ReadonlyMap<string, readonly string[]>,
): Readonly<Record<string, readonly string[]>> {
  const parentIds = new Set([...index.childrenByParent.keys(), ...updates.keys()]);
  const entries = [...parentIds].map((parentId) => [
    parentId,
    updates.get(parentId) ??
      (Object.hasOwn(tree.childrenByParent, parentId)
        ? tree.childrenByParent[parentId]
        : undefined) ??
      Object.freeze([]),
  ]);
  return Object.freeze(Object.fromEntries(entries));
}

export function applySortableItemMove(
  tree: SortableItemTree,
  value: ItemMovePlan,
): SortableItemTree {
  const move = validateItemMove(tree, value);
  const moving = new Set(move.itemIds);
  const sameParent = move.plan.sourceParentId === move.plan.destinationParentId;
  const destination = nextParentChildren(
    move.destinationChildren,
    moving,
    move.plan.destinationIndex,
    move.itemIds,
  );
  if (sameParent && arraysEqual(move.sourceChildren, destination)) {
    return tree;
  }
  const updates = new Map<string, readonly string[]>();
  updates.set(move.plan.destinationParentId, destination);
  if (!sameParent) {
    updates.set(
      move.plan.sourceParentId,
      nextParentChildren(move.sourceChildren, moving, null, move.itemIds),
    );
  }
  return Object.freeze({
    childrenByParent: childrenRecord(tree, move.index, updates),
    itemIds: tree.itemIds,
    rootId: tree.rootId,
  });
}

export function sortableItemTreesMatch(left: SortableItemTree, right: SortableItemTree): boolean {
  const leftIndex = createSortableItemTreeIndex(left);
  const rightIndex = createSortableItemTreeIndex(right);
  if (leftIndex.rootId !== rightIndex.rootId || !arraysEqual(left.itemIds, right.itemIds)) {
    return false;
  }
  return [...leftIndex.childrenByParent].every(([parentId, children]) =>
    arraysEqual(children, rightIndex.childrenByParent.get(parentId) ?? []),
  );
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((itemId, index) => itemId === right[index]);
}
