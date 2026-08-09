import { denseArrayAt, optionOverridesAt } from "./runtime-option-validation.js";
import { applySortableItemMove, sortableItemTreesMatch } from "./sortable-item-move-application.js";
import { planSortableItemMove } from "./sortable-item-move-planning.js";
import { resolveSortableItemDragBlock } from "./sortable-item-selection.js";
import type {
  ItemMovePlan,
  SortableItemDragBlock,
  SortableItemMoveRejectionCode,
  SortableItemTree,
} from "./sortable-item-tree-contract.js";
import { createSortableItemTreeIndex } from "./sortable-item-tree-validation.js";

export type SortableItemList = Readonly<{
  label: string;
  listId: string;
  tree: SortableItemTree;
}>;

export type SortableItemListDragBlock = Readonly<{
  itemIds: readonly string[];
  selectedItemIds: readonly string[];
  sourceListIds: readonly string[];
  sourceParentIds: readonly string[];
}>;

export type SortableItemListMovePlan = Readonly<{
  destinationIndex: number;
  destinationListId: string;
  destinationParentId: string;
  itemIds: readonly string[];
  sourceListIds: readonly string[];
  sourceParentIds: readonly string[];
}>;

export type SortableItemListMoveRejectionCode =
  SortableItemMoveRejectionCode | "unknown-destination-list";

type SortableItemListMoveResult = Readonly<{
  block: SortableItemListDragBlock;
  plan: SortableItemListMovePlan;
}>;

export type SortableItemListMoveDecision =
  | (SortableItemListMoveResult & Readonly<{ status: "planned" | "unchanged" }>)
  | Readonly<{
      block: SortableItemListDragBlock;
      code: SortableItemListMoveRejectionCode;
      reason: string;
      status: "rejected";
    }>;

export type SortableItemListMoveInput = Readonly<{
  activeItemId: string;
  canContainChildren?: (itemId: string, listId: string) => boolean;
  canMove?: (plan: SortableItemListMovePlan) => boolean;
  destinationIndex: number;
  destinationListId: string;
  destinationParentId: string;
  lists: readonly SortableItemList[];
  selectedItemIds: readonly string[];
}>;

type SortableItemListRoot = Readonly<{
  label: string;
  listId: string;
  publicRootId: string;
  syntheticRootId: string;
}>;

export type SortableItemListsIndex = Readonly<{
  aggregateTree: SortableItemTree;
  aggregateRootId: string;
  itemListIdByItem: ReadonlyMap<string, string>;
  listById: ReadonlyMap<string, SortableItemList>;
  listIdBySyntheticRoot: ReadonlyMap<string, string>;
  roots: readonly SortableItemListRoot[];
  syntheticRootByListId: ReadonlyMap<string, string>;
}>;

const listKeys = ["label", "listId", "tree"] as const;
const moveInputKeys = [
  "activeItemId",
  "canContainChildren",
  "canMove",
  "destinationIndex",
  "destinationListId",
  "destinationParentId",
  "lists",
  "selectedItemIds",
] as const;
const movePlanKeys = [
  "destinationIndex",
  "destinationListId",
  "destinationParentId",
  "itemIds",
  "sourceListIds",
  "sourceParentIds",
] as const;

function requiredField(record: Record<string, unknown>, key: string, label: string): unknown {
  if (!Object.hasOwn(record, key)) {
    throw new TypeError(`${label} is missing required field ${key}.`);
  }
  return record[key];
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function optionalCallback(value: unknown, label: string): void {
  if (value !== undefined && typeof value !== "function") {
    throw new TypeError(`${label} must be a function.`);
  }
}

function unusedInternalId(label: string, used: Set<string>): string {
  let suffix = 0;
  let candidate = `__setta_internal_${label}__`;
  while (used.has(candidate)) {
    suffix += 1;
    candidate = `__setta_internal_${label}_${String(suffix)}__`;
  }
  used.add(candidate);
  return candidate;
}

function listAt(value: unknown, index: number): SortableItemList {
  const label = `Sortable item list at index ${String(index)}`;
  const record = optionOverridesAt(value, listKeys, label, "sortable item list field");
  nonEmptyString(requiredField(record, "listId", label), `${label} listId`);
  nonEmptyString(requiredField(record, "label", label), `${label} label`);
  const tree = requiredField(record, "tree", label) as SortableItemTree;
  createSortableItemTreeIndex(tree);
  return value as SortableItemList;
}

function aggregateChildrenRecord(
  lists: readonly SortableItemList[],
  aggregateRootId: string,
  roots: readonly SortableItemListRoot[],
): Readonly<Record<string, readonly string[]>> {
  const entries: Array<readonly [string, readonly string[]]> = [
    [aggregateRootId, Object.freeze(roots.map((root) => root.syntheticRootId))],
  ];
  lists.forEach((list, listIndex) => {
    const root = roots[listIndex];
    if (!root) throw new Error("Every sortable item list must have an internal root.");
    const treeIndex = createSortableItemTreeIndex(list.tree);
    entries.push([
      root.syntheticRootId,
      Object.freeze([...(treeIndex.childrenByParent.get(treeIndex.rootId) ?? [])]),
    ]);
    for (const [parentId, children] of treeIndex.childrenByParent) {
      if (parentId !== treeIndex.rootId) {
        entries.push([parentId, Object.freeze([...children])]);
      }
    }
  });
  return Object.freeze(Object.fromEntries(entries));
}

export function createSortableItemListsIndex(
  value: readonly SortableItemList[],
): SortableItemListsIndex {
  const candidates = denseArrayAt(value, "Sortable item lists");
  if (candidates.length === 0) {
    throw new TypeError("Sortable item lists must contain at least one named list.");
  }
  const lists = Object.freeze(candidates.map(listAt));
  const listById = new Map<string, SortableItemList>();
  const itemListIdByItem = new Map<string, string>();
  const usedIds = new Set<string>();
  for (const list of lists) {
    if (listById.has(list.listId)) {
      throw new TypeError(`Sortable item list ID ${JSON.stringify(list.listId)} is duplicated.`);
    }
    listById.set(list.listId, list);
    for (const itemId of list.tree.itemIds) {
      const previousListId = itemListIdByItem.get(itemId);
      if (previousListId) {
        throw new TypeError(
          `Sortable item ID ${JSON.stringify(itemId)} appears in both ${JSON.stringify(previousListId)} and ${JSON.stringify(list.listId)}. Item IDs must be unique across named lists.`,
        );
      }
      itemListIdByItem.set(itemId, list.listId);
      usedIds.add(itemId);
    }
  }
  const aggregateRootId = unusedInternalId("item-lists-root", usedIds);
  const syntheticRootByListId = new Map<string, string>();
  const listIdBySyntheticRoot = new Map<string, string>();
  const roots = Object.freeze(
    lists.map((list, index) => {
      const syntheticRootId = unusedInternalId(`item-list-${String(index)}`, usedIds);
      syntheticRootByListId.set(list.listId, syntheticRootId);
      listIdBySyntheticRoot.set(syntheticRootId, list.listId);
      return Object.freeze({
        label: list.label.trim(),
        listId: list.listId,
        publicRootId: list.tree.rootId,
        syntheticRootId,
      });
    }),
  );
  const aggregateTree = Object.freeze({
    childrenByParent: aggregateChildrenRecord(lists, aggregateRootId, roots),
    itemIds: Object.freeze([
      ...roots.map((root) => root.syntheticRootId),
      ...lists.flatMap((list) => list.tree.itemIds),
    ]),
    rootId: aggregateRootId,
  });
  createSortableItemTreeIndex(aggregateTree);
  return Object.freeze({
    aggregateRootId,
    aggregateTree,
    itemListIdByItem,
    listById,
    listIdBySyntheticRoot,
    roots,
    syntheticRootByListId,
  });
}

export function validateSortableItemLists(
  value: unknown,
): asserts value is readonly SortableItemList[] {
  createSortableItemListsIndex(value as readonly SortableItemList[]);
}

function listForInternalParent(index: SortableItemListsIndex, parentId: string): SortableItemList {
  const listId = index.listIdBySyntheticRoot.get(parentId) ?? index.itemListIdByItem.get(parentId);
  const list = listId ? index.listById.get(listId) : undefined;
  if (!list) {
    throw new TypeError("Sortable item list move plans cannot target outside a named list.");
  }
  return list;
}

function publicParentId(
  index: SortableItemListsIndex,
  list: SortableItemList,
  internalParentId: string,
): string {
  return index.listIdBySyntheticRoot.has(internalParentId) ? list.tree.rootId : internalParentId;
}

export function sortableItemListPlanFromInternal(
  index: SortableItemListsIndex,
  plan: ItemMovePlan,
): SortableItemListMovePlan {
  const destinationList = listForInternalParent(index, plan.destinationParentId);
  const sourceLists = plan.sourceParentIds.map((parentId) =>
    listForInternalParent(index, parentId),
  );
  return Object.freeze({
    destinationIndex: plan.destinationIndex,
    destinationListId: destinationList.listId,
    destinationParentId: publicParentId(index, destinationList, plan.destinationParentId),
    itemIds: Object.freeze([...plan.itemIds]),
    sourceListIds: Object.freeze(sourceLists.map((list) => list.listId)),
    sourceParentIds: Object.freeze(
      plan.sourceParentIds.map((parentId, itemIndex) => {
        const sourceList = sourceLists[itemIndex];
        if (!sourceList) throw new Error("Every moving item must resolve its source list.");
        return publicParentId(index, sourceList, parentId);
      }),
    ),
  });
}

function publicDragBlock(
  index: SortableItemListsIndex,
  block: SortableItemDragBlock,
): SortableItemListDragBlock {
  const sourceLists = block.sourceParentIds.map((parentId) =>
    listForInternalParent(index, parentId),
  );
  return Object.freeze({
    itemIds: Object.freeze([...block.itemIds]),
    selectedItemIds: Object.freeze([...block.selectedItemIds]),
    sourceListIds: Object.freeze(sourceLists.map((list) => list.listId)),
    sourceParentIds: Object.freeze(
      block.sourceParentIds.map((parentId, itemIndex) => {
        const sourceList = sourceLists[itemIndex];
        if (!sourceList) throw new Error("Every moving item must resolve its source list.");
        return publicParentId(index, sourceList, parentId);
      }),
    ),
  });
}

function internalParentId(
  index: SortableItemListsIndex,
  listId: string,
  parentId: string,
  label: string,
): string {
  const list = index.listById.get(listId);
  if (!list) {
    throw new TypeError(`${label} list ${JSON.stringify(listId)} is unknown.`);
  }
  if (parentId === list.tree.rootId) {
    const syntheticRootId = index.syntheticRootByListId.get(listId);
    if (!syntheticRootId) throw new Error("A validated sortable item list must have a root.");
    return syntheticRootId;
  }
  if (index.itemListIdByItem.get(parentId) !== listId) {
    throw new TypeError(
      `${label} parent ${JSON.stringify(parentId)} is not in list ${JSON.stringify(listId)}.`,
    );
  }
  return parentId;
}

function internalPlanFromPublic(
  index: SortableItemListsIndex,
  value: SortableItemListMovePlan,
): ItemMovePlan {
  const record = optionOverridesAt(
    value,
    movePlanKeys,
    "Sortable item list move plan",
    "sortable item list move plan field",
  );
  const itemIds = denseArrayAt(
    requiredField(record, "itemIds", "Sortable item list move plan"),
    "Sortable item list move plan itemIds",
  );
  const sourceListIds = denseArrayAt(
    requiredField(record, "sourceListIds", "Sortable item list move plan"),
    "Sortable item list move plan sourceListIds",
  );
  const sourceParentIds = denseArrayAt(
    requiredField(record, "sourceParentIds", "Sortable item list move plan"),
    "Sortable item list move plan sourceParentIds",
  );
  if (sourceListIds.length !== itemIds.length || sourceParentIds.length !== itemIds.length) {
    throw new TypeError(
      "Sortable item list move plan source arrays must align with every moving item.",
    );
  }
  const destinationListId = nonEmptyString(
    requiredField(record, "destinationListId", "Sortable item list move plan"),
    "Sortable item list move plan destinationListId",
  );
  const destinationParentId = nonEmptyString(
    requiredField(record, "destinationParentId", "Sortable item list move plan"),
    "Sortable item list move plan destinationParentId",
  );
  return {
    destinationIndex: requiredField(
      record,
      "destinationIndex",
      "Sortable item list move plan",
    ) as number,
    destinationParentId: internalParentId(
      index,
      destinationListId,
      destinationParentId,
      "Destination",
    ),
    itemIds: itemIds as readonly string[],
    sourceParentIds: sourceParentIds.map((parentId, itemIndex) =>
      internalParentId(
        index,
        nonEmptyString(
          sourceListIds[itemIndex],
          `Sortable item list move plan sourceListIds at index ${String(itemIndex)}`,
        ),
        nonEmptyString(
          parentId,
          `Sortable item list move plan sourceParentIds at index ${String(itemIndex)}`,
        ),
        "Source",
      ),
    ),
  };
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((itemId, index) => itemId === right[index]);
}

function projectedItemOrder(
  rootId: string,
  childrenByParent: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  const order: string[] = [];
  const stack = [...(childrenByParent.get(rootId) ?? [])].reverse();
  while (stack.length > 0) {
    const itemId = stack.pop();
    if (itemId === undefined) break;
    order.push(itemId);
    const children = childrenByParent.get(itemId) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const childId = children[index];
      if (childId !== undefined) stack.push(childId);
    }
  }
  return order;
}

function stableChildren(
  current: readonly string[] | undefined,
  next: readonly string[],
): readonly string[] {
  return current && arraysEqual(current, next) ? current : Object.freeze([...next]);
}

function splitAggregateTree(
  index: SortableItemListsIndex,
  projectedTree: SortableItemTree,
): readonly SortableItemList[] {
  const projected = createSortableItemTreeIndex(projectedTree);
  const nextLists = index.roots.map((root) => {
    const current = index.listById.get(root.listId);
    if (!current) throw new Error("A validated sortable item list root must resolve its list.");
    const itemIds = projectedItemOrder(root.syntheticRootId, projected.childrenByParent);
    const entries: Array<readonly [string, readonly string[]]> = [];
    const rootChildren = projected.childrenByParent.get(root.syntheticRootId) ?? [];
    entries.push([
      current.tree.rootId,
      stableChildren(current.tree.childrenByParent[current.tree.rootId], rootChildren),
    ]);
    for (const itemId of itemIds) {
      const children = projected.childrenByParent.get(itemId);
      if (children !== undefined) {
        entries.push([itemId, stableChildren(current.tree.childrenByParent[itemId], children)]);
      }
    }
    const nextTree = Object.freeze({
      childrenByParent: Object.freeze(Object.fromEntries(entries)),
      itemIds: stableChildren(current.tree.itemIds, itemIds),
      rootId: current.tree.rootId,
    });
    if (sortableItemTreesMatch(current.tree, nextTree)) return current;
    return Object.freeze({ ...current, tree: nextTree });
  });
  return nextLists.every((list) => index.listById.get(list.listId) === list)
    ? [...index.roots].map((root) => {
        const list = index.listById.get(root.listId);
        if (!list) throw new Error("A validated sortable item list must remain available.");
        return list;
      })
    : Object.freeze(nextLists);
}

export function applySortableItemListMove(
  lists: readonly SortableItemList[],
  value: SortableItemListMovePlan,
): readonly SortableItemList[] {
  const index = createSortableItemListsIndex(lists);
  const projected = applySortableItemMove(
    index.aggregateTree,
    internalPlanFromPublic(index, value),
  );
  return projected === index.aggregateTree ? lists : splitAggregateTree(index, projected);
}

function destinationParent(
  index: SortableItemListsIndex,
  destinationListId: unknown,
  destinationParentId: unknown,
): Readonly<{ parentId: string; resolved: true }> | Readonly<{ reason: string; resolved: false }> {
  const listId = nonEmptyString(destinationListId, "Sortable item destination list ID");
  const list = index.listById.get(listId);
  if (!list) {
    return {
      reason: `Destination list ${JSON.stringify(listId)} is not in the sortable item lists.`,
      resolved: false,
    };
  }
  const parentId = nonEmptyString(destinationParentId, "Sortable item destination parent ID");
  if (parentId === list.tree.rootId) {
    const syntheticRootId = index.syntheticRootByListId.get(listId);
    if (!syntheticRootId) throw new Error("A validated sortable item list must have a root.");
    return { parentId: syntheticRootId, resolved: true };
  }
  if (index.itemListIdByItem.get(parentId) !== listId) {
    return {
      reason: `Destination parent ${JSON.stringify(parentId)} is not in list ${JSON.stringify(listId)}.`,
      resolved: false,
    };
  }
  return { parentId, resolved: true };
}

function internalCanContain(
  index: SortableItemListsIndex,
  callback: SortableItemListMoveInput["canContainChildren"],
): ((itemId: string) => boolean) | undefined {
  if (!callback) return undefined;
  return (itemId: string) => {
    if (index.listIdBySyntheticRoot.has(itemId)) return true;
    const listId = index.itemListIdByItem.get(itemId);
    if (!listId) return false;
    return callback(itemId, listId);
  };
}

function rejectedDecision(
  block: SortableItemListDragBlock,
  code: SortableItemListMoveRejectionCode,
  reason: string,
): SortableItemListMoveDecision {
  return Object.freeze({ block, code, reason, status: "rejected" });
}

export function planSortableItemListMove(
  value: SortableItemListMoveInput,
): SortableItemListMoveDecision {
  const input = optionOverridesAt(
    value,
    moveInputKeys,
    "Sortable item list move input",
    "sortable item list move field",
  );
  const lists = requiredField(
    input,
    "lists",
    "Sortable item list move input",
  ) as readonly SortableItemList[];
  const index = createSortableItemListsIndex(lists);
  optionalCallback(input.canContainChildren, "Sortable item list canContainChildren");
  optionalCallback(input.canMove, "Sortable item list canMove");
  const activeItemId = nonEmptyString(
    requiredField(input, "activeItemId", "Sortable item list move input"),
    "Active sortable item ID",
  );
  if (!index.itemListIdByItem.has(activeItemId)) {
    throw new TypeError(`Active sortable item ID ${JSON.stringify(activeItemId)} is unknown.`);
  }
  const selectedItemIds = requiredField(
    input,
    "selectedItemIds",
    "Sortable item list move input",
  ) as readonly string[];
  const internalBlock = resolveSortableItemDragBlock(
    index.aggregateTree,
    selectedItemIds,
    activeItemId,
  );
  const block = publicDragBlock(index, internalBlock);
  const destination = destinationParent(
    index,
    requiredField(input, "destinationListId", "Sortable item list move input"),
    requiredField(input, "destinationParentId", "Sortable item list move input"),
  );
  if (!destination.resolved) {
    const listId = input.destinationListId;
    return rejectedDecision(
      block,
      typeof listId === "string" && index.listById.has(listId)
        ? "unknown-destination-parent"
        : "unknown-destination-list",
      destination.reason,
    );
  }
  const canContainChildren = internalCanContain(
    index,
    input.canContainChildren as SortableItemListMoveInput["canContainChildren"],
  );
  const canMove = input.canMove as SortableItemListMoveInput["canMove"];
  const decision = planSortableItemMove({
    activeItemId,
    ...(canContainChildren ? { canContainChildren } : {}),
    ...(canMove
      ? {
          canMove: (plan) => canMove(sortableItemListPlanFromInternal(index, plan)),
        }
      : {}),
    destinationIndex: requiredField(
      input,
      "destinationIndex",
      "Sortable item list move input",
    ) as number,
    destinationParentId: destination.parentId,
    selectedItemIds,
    tree: index.aggregateTree,
  });
  if (decision.status === "rejected") {
    return rejectedDecision(block, decision.code, decision.reason);
  }
  return Object.freeze({
    block,
    plan: sortableItemListPlanFromInternal(index, decision.plan),
    status: decision.status,
  });
}
