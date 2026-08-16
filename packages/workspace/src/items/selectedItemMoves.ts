import { getActiveSectionIds } from "../document/activeSections";
import { insertIntoArray } from "../document/arrayUtils";
import { useWorkspaceCapabilities } from "../document/capabilities";
import {
  getSectionHasSelectedItems,
  getSectionItemTreeOrThrow,
} from "../document/documentSelectors";
import {
  buildItemParentMap,
  buildItemTreeView,
  getItemOrThrow,
  getRootSelectedItemIds,
  getSharedItemParentId,
  resolveFullIndexForVisibleInsertion,
  type ItemTreeView,
} from "../document/itemTree";
import {
  applyItemMoveToTree,
  commitSectionItemTree,
  type ItemTreeMove,
} from "../document/moveItems";
import { useWorkspaceDocument } from "../document/stores";
import type { WorkspaceSectionItemTree } from "../document/types";
import { getSectionItemVisibility } from "./itemListRegistry";

// The reference's keyboard param movement (`moveSelectedParamsUp/Down`, `indentSelectedParams`,
// `unindentSelectedParams` in `state/actions/params/moveParams.ts`) in item terms. The offset
// moves keep the reference's visible-group resolution and apply the resolved group moves as one
// canonical commit (the reference dispatches them through a single optimistic update); indent
// and unindent port the reference backend's semantics (`param_moves.go`): indent moves each
// contiguous selected run under its nearest preceding unselected sibling, unindent promotes
// each per-parent run to just after its parent. The reference's leaf→`NestedParam` promotion on
// indent and its empty-parent type restore on unindent are structural no-ops here — every item
// carries `children`; presentation changes remain independent of structural movement.
// App-only branches dropped: the backend routes (the document-change callback notifies the host
// once per applied action), the deployment-mode guard (the `canEditStructure` capability), and
// the filter/hidden/multi-parent toasts (the disabled fallbacks they narrate are unchanged).
// Visibility and the active-filter answer come from the registered list views, like drag start.

type ItemSelectionBase = {
  sectionId: string;
  itemTree: WorkspaceSectionItemTree;
  rootSelected: Array<string>;
  parentById: Record<string, string | null>;
  visibleItemIds: Set<string>;
};

type ItemMovementContext = ItemSelectionBase & {
  sharedParent: string;
  tree: ItemTreeView;
};

type ItemOffsetState = {
  visibleSiblings: Array<string>;
  fullChildren: Array<string>;
};

type ResolvedItemOffsetMove = {
  itemIds: Array<string>;
  remainingVisible: Array<string>;
  targetVisibleIndex: number;
  newIndex: number;
};

type ItemParentMoveGroup = {
  parentId: string;
  itemIds: Array<string>;
};

export function moveSelectedItemsUp(): boolean {
  return moveSelectedItemsByOffset(-1);
}

export function moveSelectedItemsDown(): boolean {
  return moveSelectedItemsByOffset(1);
}

function moveSelectedItemsByOffset(direction: -1 | 1): boolean {
  const context = getItemMovementContext();
  if (!context) {
    return false;
  }
  const moveState = getItemOffsetState(context);
  if (!moveState) {
    return false;
  }
  const selectedSet = new Set(context.rootSelected);
  const moves: Array<ItemTreeMove> = [];
  for (const group of getOffsetMoveGroups(
    direction,
    moveState.visibleSiblings,
    selectedSet,
  )) {
    const resolved = resolveItemOffsetMove({
      direction,
      group,
      selectedSet,
      moveState,
    });
    if (!resolved) {
      continue;
    }
    moves.push({
      itemIds: resolved.itemIds,
      newParentId: context.sharedParent,
      newIndex: resolved.newIndex,
    });
    applyResolvedItemOffsetMove(moveState, resolved);
  }
  if (moves.length === 0) {
    return false;
  }
  commitSectionItemTree(
    context.sectionId,
    moves.reduce(
      (tree, move) => applyItemMoveToTree(tree, move),
      context.itemTree,
    ),
  );
  return true;
}

export function indentSelectedItems(): boolean {
  const context = getItemMovementContext();
  if (!context) {
    return false;
  }
  const selectedSet = new Set(context.rootSelected);
  let tree = context.itemTree;
  // The reference backend builds the same contiguous selected runs, but over the parent's full
  // child order — a hidden sibling splits a run even though it never renders.
  const groups = buildVisibleSelectionGroups(
    getItemOrThrow(tree, context.sharedParent).children,
    selectedSet,
  );
  for (const group of groups) {
    tree = indentItemGroup(tree, context.sharedParent, group, selectedSet);
  }
  commitSectionItemTree(context.sectionId, tree);
  return true;
}

export function unindentSelectedItems(): boolean {
  const base = getItemSelectionBase();
  if (!base) {
    return false;
  }
  let tree = base.itemTree;
  for (const group of buildItemParentMoveGroups(
    base.rootSelected,
    base.parentById,
  )) {
    tree = unindentItemParentGroup(tree, base.parentById, group);
  }
  commitSectionItemTree(base.sectionId, tree);
  return true;
}

function getItemSelectionBase(): ItemSelectionBase | null {
  if (!useWorkspaceCapabilities.getState().canEditStructure) {
    return null;
  }
  const sectionId = resolveSectionWithSelectedItems();
  if (!sectionId) {
    return null;
  }
  const visibility = getSectionItemVisibility(sectionId);
  if (!visibility || visibility.filterActive) {
    return null;
  }
  const itemTree = getSectionItemTreeOrThrow(
    useWorkspaceDocument.getState(),
    sectionId,
  );
  const parentById = buildItemParentMap(itemTree);
  const rootSelected = getRootSelectedItemIds(
    parentById,
    itemTree.selectedItemIds,
  );
  if (rootSelected.some((itemId) => !visibility.visibleItemIds.has(itemId))) {
    return null;
  }
  return {
    sectionId,
    itemTree,
    rootSelected,
    parentById,
    visibleItemIds: visibility.visibleItemIds,
  };
}

function getItemMovementContext(): ItemMovementContext | null {
  const base = getItemSelectionBase();
  if (!base) {
    return null;
  }
  const sharedParent = getSharedItemParentId(
    base.parentById,
    base.rootSelected,
  );
  if (!sharedParent) {
    return null;
  }
  const topLevelItemIds = getItemOrThrow(
    base.itemTree,
    base.itemTree.rootId,
  ).children.filter((itemId) => base.visibleItemIds.has(itemId));
  return {
    ...base,
    sharedParent,
    tree: buildItemTreeView(
      base.itemTree,
      topLevelItemIds,
      base.visibleItemIds,
    ),
  };
}

function resolveSectionWithSelectedItems(): string | null {
  const state = useWorkspaceDocument.getState();
  const activeId = getActiveSectionIds()[0] ?? null;
  if (activeId && getSectionHasSelectedItems(state, activeId)) {
    return activeId;
  }
  for (const sectionId of Object.keys(state.sections)) {
    if (getSectionHasSelectedItems(state, sectionId)) {
      return sectionId;
    }
  }
  return null;
}

function getItemOffsetState(
  context: ItemMovementContext,
): ItemOffsetState | null {
  const visibleSiblings = [
    ...(context.tree.visibleChildrenByParent[context.sharedParent] ?? []),
  ];
  if (visibleSiblings.length === 0) {
    return null;
  }
  return {
    visibleSiblings,
    fullChildren: [
      ...getItemOrThrow(context.itemTree, context.sharedParent).children,
    ],
  };
}

function buildVisibleSelectionGroups(
  visibleSiblings: Array<string>,
  selectedSet: ReadonlySet<string>,
): Array<Array<string>> {
  const groups: Array<Array<string>> = [];
  let current: Array<string> = [];
  for (const itemId of visibleSiblings) {
    if (selectedSet.has(itemId)) {
      current.push(itemId);
      continue;
    }
    if (current.length > 0) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
}

// Downward moves process groups bottom-up so each group lands past the neighbor below it
// before the group above recomputes its target.
function getOffsetMoveGroups(
  direction: -1 | 1,
  visibleSiblings: Array<string>,
  selectedSet: ReadonlySet<string>,
): Array<Array<string>> {
  const groups = buildVisibleSelectionGroups(visibleSiblings, selectedSet);
  return direction < 0 ? groups : [...groups].reverse();
}

function findTargetVisibleIndex({
  direction,
  group,
  visibleSiblings,
  remainingVisible,
  selectedSet,
}: {
  direction: -1 | 1;
  group: Array<string>;
  visibleSiblings: Array<string>;
  remainingVisible: Array<string>;
  selectedSet: ReadonlySet<string>;
}): number | null {
  const boundaryId = direction < 0 ? group[0] : group[group.length - 1];
  const boundaryIndex =
    boundaryId === undefined ? -1 : visibleSiblings.indexOf(boundaryId);
  if (boundaryIndex < 0) {
    return null;
  }
  for (
    let index = boundaryIndex + direction;
    index >= 0 && index < visibleSiblings.length;
    index += direction
  ) {
    const candidate = visibleSiblings[index];
    if (candidate === undefined || selectedSet.has(candidate)) {
      continue;
    }
    const candidateIndex = remainingVisible.indexOf(candidate);
    return direction < 0 ? candidateIndex : candidateIndex + 1;
  }
  return null;
}

function resolveItemOffsetMove({
  direction,
  group,
  selectedSet,
  moveState,
}: {
  direction: -1 | 1;
  group: Array<string>;
  selectedSet: ReadonlySet<string>;
  moveState: ItemOffsetState;
}): ResolvedItemOffsetMove | null {
  const movingIds = new Set(group);
  const remainingVisible = moveState.visibleSiblings.filter(
    (itemId) => !movingIds.has(itemId),
  );
  const targetVisibleIndex = findTargetVisibleIndex({
    direction,
    group,
    visibleSiblings: moveState.visibleSiblings,
    remainingVisible,
    selectedSet,
  });
  if (targetVisibleIndex === null) {
    return null;
  }
  const newIndex = resolveFullIndexForVisibleInsertion({
    targetVisibleIndex,
    movingIds,
    visibleSiblings: moveState.visibleSiblings,
    fullChildren: moveState.fullChildren,
  });
  if (newIndex === null) {
    return null;
  }
  return {
    itemIds: moveState.fullChildren.filter((itemId) => movingIds.has(itemId)),
    remainingVisible,
    targetVisibleIndex,
    newIndex,
  };
}

// Later groups resolve against the sibling order the earlier groups already produced; the
// canonical tree itself changes once, at the commit.
function applyResolvedItemOffsetMove(
  moveState: ItemOffsetState,
  move: ResolvedItemOffsetMove,
) {
  const movingIds = new Set(move.itemIds);
  moveState.visibleSiblings = insertIntoArray(
    move.remainingVisible,
    move.targetVisibleIndex,
    ...move.itemIds,
  );
  moveState.fullChildren = insertIntoArray(
    moveState.fullChildren.filter((itemId) => !movingIds.has(itemId)),
    move.newIndex,
    ...move.itemIds,
  );
}

function indentItemGroup(
  tree: WorkspaceSectionItemTree,
  parentId: string,
  group: Array<string>,
  selectedSet: ReadonlySet<string>,
): WorkspaceSectionItemTree {
  const currentChildren = getItemOrThrow(tree, parentId).children;
  const groupSet = new Set(group);
  const orderedGroupIds = currentChildren.filter((itemId) =>
    groupSet.has(itemId),
  );
  const firstId = orderedGroupIds[0];
  if (firstId === undefined) {
    return tree;
  }
  const previousId = findPreviousUnselectedSibling(
    currentChildren,
    currentChildren.indexOf(firstId),
    selectedSet,
  );
  if (!previousId) {
    return tree;
  }
  return applyItemMoveToTree(tree, {
    itemIds: orderedGroupIds,
    newParentId: previousId,
    newIndex: getItemOrThrow(tree, previousId).children.length,
  });
}

function findPreviousUnselectedSibling(
  children: Array<string>,
  firstIndex: number,
  selectedSet: ReadonlySet<string>,
): string | null {
  for (let index = firstIndex - 1; index >= 0; index -= 1) {
    const candidate = children[index];
    if (candidate !== undefined && !selectedSet.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

function buildItemParentMoveGroups(
  itemIds: Array<string>,
  parentById: Record<string, string | null>,
): Array<ItemParentMoveGroup> {
  const itemsByParent = new Map<string, Array<string>>();
  for (const itemId of itemIds) {
    const parentId = parentById[itemId];
    if (!parentId) {
      throw new Error(
        `Selected item ${itemId} has no parent in the item tree.`,
      );
    }
    const group = itemsByParent.get(parentId);
    if (group) {
      group.push(itemId);
    } else {
      itemsByParent.set(parentId, [itemId]);
    }
  }
  return [...itemsByParent].map(([parentId, ids]) => ({
    parentId,
    itemIds: ids,
  }));
}

function unindentItemParentGroup(
  tree: WorkspaceSectionItemTree,
  parentById: Record<string, string | null>,
  group: ItemParentMoveGroup,
): WorkspaceSectionItemTree {
  const grandparentId = parentById[group.parentId];
  if (!grandparentId) {
    return tree;
  }
  const parentIndex = getItemOrThrow(tree, grandparentId).children.indexOf(
    group.parentId,
  );
  if (parentIndex < 0) {
    throw new Error(
      `Item ${group.parentId} is missing from its parent ${grandparentId}.`,
    );
  }
  return applyItemMoveToTree(tree, {
    itemIds: group.itemIds,
    newParentId: grandparentId,
    newIndex: parentIndex + 1,
  });
}
