import { isDenseArray, optionOverridesAt } from "./runtime-option-validation.js";
import type { ItemMovePlan, SortableItemTree } from "./sortable-item-tree-contract.js";
import {
  createSortableItemTreeIndex,
  type SortableItemTreeIndex,
} from "./sortable-item-tree-validation.js";

const planKeys = ["destinationIndex", "destinationParentId", "itemIds", "sourceParentIds"] as const;

type ValidatedItemMove = Readonly<{
  destinationChildren: readonly string[];
  index: SortableItemTreeIndex;
  itemIds: readonly string[];
  plan: ItemMovePlan;
  sourceChildrenByParent: ReadonlyMap<string, readonly string[]>;
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
  value: unknown,
  index: SortableItemTreeIndex,
): readonly string[] {
  if (!isDenseArray(value) || value.length !== itemIds.length) {
    throw new TypeError(
      "Sortable item move plan sourceParentIds must align with every moving item.",
    );
  }
  const sourceParentIds = Object.freeze(
    value.map((candidate, itemIndex) => {
      const parentId = knownParent(
        candidate,
        index,
        `Sortable item move plan sourceParentIds at index ${String(itemIndex)}`,
      );
      if (index.parentByItem.get(itemIds[itemIndex] as string) !== parentId) {
        throw new TypeError(
          "Sortable item move plan sourceParentIds must match canonical item placement.",
        );
      }
      return parentId;
    }),
  );
  const moving = new Set(itemIds);
  const canonical = index.itemOrder.filter((itemId) => moving.has(itemId));
  if (!arraysEqual(canonical, itemIds)) {
    throw new TypeError("Sortable item move plan items must follow canonical tree order.");
  }
  return sourceParentIds;
}

function validateDestinationIndex(
  value: unknown,
  destinationChildren: readonly string[],
  itemIds: readonly string[],
): number {
  const moving = new Set(itemIds);
  const maximum = destinationChildren.filter((itemId) => !moving.has(itemId)).length;
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
  const sourceParentIds = validateSourceOrder(itemIds, record.sourceParentIds, index);
  const destinationParentId = knownParent(
    record.destinationParentId,
    index,
    "Sortable item move plan destinationParentId",
  );
  const destinationChildren = index.childrenByParent.get(destinationParentId) ?? [];
  const destinationIndex = validateDestinationIndex(
    record.destinationIndex,
    destinationChildren,
    itemIds,
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
      sourceParentIds,
    }),
    sourceChildrenByParent: new Map(
      [...new Set(sourceParentIds)].map((parentId) => [
        parentId,
        index.childrenByParent.get(parentId) ?? [],
      ]),
    ),
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
  const destination = nextParentChildren(
    move.destinationChildren,
    moving,
    move.plan.destinationIndex,
    move.itemIds,
  );
  const updates = new Map<string, readonly string[]>();
  updates.set(move.plan.destinationParentId, destination);
  for (const [sourceParentId, sourceChildren] of move.sourceChildrenByParent) {
    if (sourceParentId === move.plan.destinationParentId) continue;
    updates.set(sourceParentId, nextParentChildren(sourceChildren, moving, null, move.itemIds));
  }
  if (
    [...updates].every(([parentId, children]) =>
      arraysEqual(move.index.childrenByParent.get(parentId) ?? [], children),
    )
  ) {
    return tree;
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
