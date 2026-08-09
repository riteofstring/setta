import { optionOverridesAt } from "./runtime-option-validation.js";
import { resolveSortableItemDragBlockFromIndex } from "./sortable-item-selection.js";
import {
  type ItemMovePlan,
  type SortableItemDragBlock,
  type SortableItemMoveDecision,
  type SortableItemMoveInput,
} from "./sortable-item-tree-contract.js";
import {
  createSortableItemTreeIndex,
  type SortableItemTreeIndex,
} from "./sortable-item-tree-validation.js";

const inputKeys = [
  "activeItemId",
  "canContainChildren",
  "canMove",
  "destinationIndex",
  "destinationParentId",
  "selectedItemIds",
  "tree",
] as const;

export function planSortableItemMove(value: SortableItemMoveInput): SortableItemMoveDecision {
  const input = optionOverridesAt(
    value,
    inputKeys,
    "Sortable item move input",
    "sortable item move field",
  );
  const index = createSortableItemTreeIndex(input.tree as SortableItemMoveInput["tree"]);
  validateOptionalCallback(input.canContainChildren, "Sortable item canContainChildren");
  validateOptionalCallback(input.canMove, "Sortable item canMove");
  const block = resolveSortableItemDragBlockFromIndex(
    index,
    input.selectedItemIds as readonly string[],
    input.activeItemId as string,
  );
  const destination = resolveDestination(input, block, index);
  if (!destination.resolved) {
    return destination.decision;
  }
  const constraintRejection = validateDestinationConstraints(
    destination.parentId,
    block,
    index,
    input.canContainChildren,
  );
  if (constraintRejection) {
    return constraintRejection;
  }
  const resolvedIndex = resolveDestinationIndex(
    destination.index,
    destination.children,
    block,
    destination.parentId,
  );
  const plan = itemMovePlan(block, destination.parentId, resolvedIndex);
  if (moveIsUnchanged(plan, index.childrenByParent)) {
    return Object.freeze({ block, plan, status: "unchanged" });
  }
  if (!hostAccepts(input.canMove, plan)) {
    return rejected(block, "host-policy", "The host rejected this item move.");
  }
  return Object.freeze({ block, plan, status: "planned" });
}

function validateOptionalCallback(value: unknown, label: string): void {
  if (value !== undefined && typeof value !== "function") {
    throw new TypeError(`${label} must be a function.`);
  }
}

type DestinationResolution =
  | Readonly<{
      children: readonly string[];
      index: number;
      parentId: string;
      resolved: true;
    }>
  | Readonly<{ decision: SortableItemMoveDecision; resolved: false }>;

function resolveDestination(
  input: Record<string, unknown>,
  block: SortableItemDragBlock,
  index: SortableItemTreeIndex,
): DestinationResolution {
  const parentId = destinationParentAt(input.destinationParentId);
  if (parentId !== index.rootId && !index.parentByItem.has(parentId)) {
    return {
      decision: rejected(
        block,
        "unknown-destination-parent",
        `Destination parent "${parentId}" is not in the sortable item tree.`,
      ),
      resolved: false,
    };
  }
  const children = index.childrenByParent.get(parentId) ?? [];
  const destinationIndex = input.destinationIndex;
  if (!validDestinationIndex(destinationIndex, children.length)) {
    return {
      decision: rejected(
        block,
        "invalid-destination-index",
        `Destination index must be an integer from 0 through ${String(children.length)}.`,
      ),
      resolved: false,
    };
  }
  return { children, index: destinationIndex, parentId, resolved: true };
}

function validDestinationIndex(value: unknown, childCount: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= childCount;
}

function validateDestinationConstraints(
  destinationParentId: string,
  block: SortableItemDragBlock,
  index: SortableItemTreeIndex,
  canContainChildren: unknown,
): SortableItemMoveDecision | null {
  if (containsMovingAncestor(destinationParentId, block, index.parentByItem, index.rootId)) {
    return rejected(block, "cycle", "An item cannot move into itself or one of its descendants.");
  }
  if (!acceptsChildren(canContainChildren, destinationParentId, index.rootId)) {
    return rejected(
      block,
      "destination-cannot-contain",
      `Destination item "${destinationParentId}" cannot contain children.`,
    );
  }
  return null;
}

function destinationParentAt(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("Sortable item destination parent ID must be a non-empty string.");
  }
  return value;
}

function containsMovingAncestor(
  destinationParentId: string,
  block: SortableItemDragBlock,
  parentByItem: ReadonlyMap<string, string>,
  rootId: string,
): boolean {
  const movingItems = new Set(block.itemIds);
  let itemId = destinationParentId;
  while (itemId !== rootId) {
    if (movingItems.has(itemId)) {
      return true;
    }
    const parentId = parentByItem.get(itemId);
    if (parentId === undefined) {
      return false;
    }
    itemId = parentId;
  }
  return false;
}

function acceptsChildren(callback: unknown, destinationParentId: string, rootId: string): boolean {
  if (destinationParentId === rootId || callback === undefined) {
    return true;
  }
  if (typeof callback !== "function") {
    throw new TypeError("Sortable item canContainChildren must be a function.");
  }
  const accepted = (callback as (itemId: string) => unknown)(destinationParentId);
  if (typeof accepted !== "boolean") {
    throw new TypeError("Sortable item canContainChildren must return a boolean.");
  }
  return accepted;
}

function resolveDestinationIndex(
  destinationIndex: number,
  destinationChildren: readonly string[],
  block: SortableItemDragBlock,
  destinationParentId: string,
): number {
  if (block.sourceParentId !== destinationParentId) {
    return destinationIndex;
  }
  const movingItems = new Set(block.itemIds);
  return (
    destinationIndex -
    destinationChildren.slice(0, destinationIndex).filter((itemId) => movingItems.has(itemId))
      .length
  );
}

function itemMovePlan(
  block: SortableItemDragBlock,
  destinationParentId: string,
  destinationIndex: number,
): ItemMovePlan {
  return Object.freeze({
    destinationIndex,
    destinationParentId,
    itemIds: Object.freeze([...block.itemIds]),
    sourceParentId: block.sourceParentId,
  });
}

function moveIsUnchanged(
  plan: ItemMovePlan,
  childrenByParent: ReadonlyMap<string, readonly string[]>,
): boolean {
  if (plan.sourceParentId !== plan.destinationParentId) {
    return false;
  }
  const current = childrenByParent.get(plan.sourceParentId) ?? [];
  const movingItems = new Set(plan.itemIds);
  const remaining = current.filter((itemId) => !movingItems.has(itemId));
  const next = [
    ...remaining.slice(0, plan.destinationIndex),
    ...plan.itemIds,
    ...remaining.slice(plan.destinationIndex),
  ];
  return arraysEqual(current, next);
}

function hostAccepts(callback: unknown, plan: ItemMovePlan): boolean {
  if (callback === undefined) {
    return true;
  }
  if (typeof callback !== "function") {
    throw new TypeError("Sortable item canMove must be a function.");
  }
  const accepted = (callback as (plan: ItemMovePlan) => unknown)(plan);
  if (typeof accepted !== "boolean") {
    throw new TypeError("Sortable item canMove must return a boolean.");
  }
  return accepted;
}

function rejected(
  block: SortableItemDragBlock,
  code: Extract<SortableItemMoveDecision, { status: "rejected" }>["code"],
  reason: string,
): SortableItemMoveDecision {
  return Object.freeze({ block, code, reason, status: "rejected" });
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((itemId, index) => itemId === right[index]);
}
