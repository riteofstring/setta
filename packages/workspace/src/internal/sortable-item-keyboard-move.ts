import { optionOverridesAt } from "./runtime-option-validation.js";
import { planSortableItemMove } from "./sortable-item-move-planning.js";
import {
  resolveSortableItemDragAnchor,
  resolveSortableItemDragBlockFromIndex,
} from "./sortable-item-selection.js";
import type {
  ItemMovePlan,
  SortableItemKeyboardCommand,
  SortableItemKeyboardMoveInput,
  SortableItemMoveDecision,
} from "./sortable-item-tree-contract.js";
import { createSortableItemTreeIndex } from "./sortable-item-tree-validation.js";

const inputKeys = [
  "activeItemId",
  "canContainChildren",
  "canMove",
  "command",
  "selectedItemIds",
  "tree",
] as const;

const commands = new Set<SortableItemKeyboardCommand>([
  "indent",
  "move-down",
  "move-up",
  "outdent",
]);

type KeyboardDestination = Readonly<{ index: number; parentId: string }>;

function unchangedDestination(
  sourceParentId: string,
  sourceChildren: readonly string[],
  firstMovingIndex: number,
): KeyboardDestination {
  return {
    index: Math.max(0, Math.min(firstMovingIndex, sourceChildren.length)),
    parentId: sourceParentId,
  };
}

function reorderDestination(
  command: "move-down" | "move-up",
  sourceParentId: string,
  sourceChildren: readonly string[],
  movingItemIds: readonly string[],
): KeyboardDestination {
  const moving = new Set(movingItemIds);
  const indexes = sourceChildren.flatMap((itemId, index) => (moving.has(itemId) ? [index] : []));
  const firstIndex = indexes[0] ?? 0;
  const lastIndex = indexes.at(-1) ?? firstIndex;
  if (command === "move-up") {
    return { index: Math.max(0, firstIndex - 1), parentId: sourceParentId };
  }
  return {
    index: Math.min(sourceChildren.length, lastIndex + 2),
    parentId: sourceParentId,
  };
}

function indentDestination(
  sourceParentId: string,
  sourceChildren: readonly string[],
  movingItemIds: readonly string[],
  childrenByParent: ReadonlyMap<string, readonly string[]>,
): KeyboardDestination {
  const firstItemId = movingItemIds[0];
  const firstIndex = firstItemId ? sourceChildren.indexOf(firstItemId) : -1;
  const previousSiblingId = firstIndex > 0 ? sourceChildren[firstIndex - 1] : undefined;
  if (!previousSiblingId) {
    return unchangedDestination(sourceParentId, sourceChildren, Math.max(0, firstIndex));
  }
  return {
    index: (childrenByParent.get(previousSiblingId) ?? []).length,
    parentId: previousSiblingId,
  };
}

function outdentDestination(
  sourceParentId: string,
  sourceChildren: readonly string[],
  movingItemIds: readonly string[],
  rootId: string,
  parentByItem: ReadonlyMap<string, string>,
  childrenByParent: ReadonlyMap<string, readonly string[]>,
): KeyboardDestination {
  const firstItemId = movingItemIds[0];
  const firstIndex = firstItemId ? sourceChildren.indexOf(firstItemId) : 0;
  if (sourceParentId === rootId) {
    return unchangedDestination(sourceParentId, sourceChildren, firstIndex);
  }
  const grandparentId = parentByItem.get(sourceParentId);
  if (grandparentId === undefined) {
    throw new TypeError(`Sortable item parent ${JSON.stringify(sourceParentId)} has no placement.`);
  }
  const parentIndex = (childrenByParent.get(grandparentId) ?? []).indexOf(sourceParentId);
  if (parentIndex < 0) {
    throw new TypeError(`Sortable item parent ${JSON.stringify(sourceParentId)} is not placed.`);
  }
  return { index: parentIndex + 1, parentId: grandparentId };
}

function keyboardDestination(
  command: SortableItemKeyboardCommand,
  sourceParentId: string,
  sourceChildren: readonly string[],
  movingItemIds: readonly string[],
  rootId: string,
  parentByItem: ReadonlyMap<string, string>,
  childrenByParent: ReadonlyMap<string, readonly string[]>,
): KeyboardDestination {
  if (command === "move-down" || command === "move-up") {
    return reorderDestination(command, sourceParentId, sourceChildren, movingItemIds);
  }
  if (command === "indent") {
    return indentDestination(sourceParentId, sourceChildren, movingItemIds, childrenByParent);
  }
  return outdentDestination(
    sourceParentId,
    sourceChildren,
    movingItemIds,
    rootId,
    parentByItem,
    childrenByParent,
  );
}

export function planSortableItemKeyboardMove(
  value: SortableItemKeyboardMoveInput,
): SortableItemMoveDecision {
  const input = optionOverridesAt(
    value,
    inputKeys,
    "Sortable item keyboard move input",
    "sortable item keyboard move field",
  );
  if (!commands.has(input.command as SortableItemKeyboardCommand)) {
    throw new TypeError(
      "Sortable item keyboard command must be indent, move-down, move-up, or outdent.",
    );
  }
  const tree = input.tree as SortableItemKeyboardMoveInput["tree"];
  const index = createSortableItemTreeIndex(tree);
  const block = resolveSortableItemDragBlockFromIndex(
    index,
    input.selectedItemIds as readonly string[],
    input.activeItemId as string,
  );
  const anchor = resolveSortableItemDragAnchor(index, block, input.activeItemId as string);
  const sourceChildren = index.childrenByParent.get(anchor.parentId) ?? [];
  const movingFromAnchorParent = block.itemIds.filter(
    (_, itemIndex) => block.sourceParentIds[itemIndex] === anchor.parentId,
  );
  const destination = keyboardDestination(
    input.command as SortableItemKeyboardCommand,
    anchor.parentId,
    sourceChildren,
    movingFromAnchorParent,
    index.rootId,
    index.parentByItem,
    index.childrenByParent,
  );
  return planSortableItemMove({
    activeItemId: input.activeItemId as string,
    ...(input.canContainChildren === undefined
      ? {}
      : {
          canContainChildren: input.canContainChildren as (itemId: string) => boolean,
        }),
    ...(input.canMove === undefined
      ? {}
      : { canMove: input.canMove as (plan: ItemMovePlan) => boolean }),
    destinationIndex: destination.index,
    destinationParentId: destination.parentId,
    selectedItemIds: input.selectedItemIds as readonly string[],
    tree,
  });
}
