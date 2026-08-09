import { insertIntoArray } from "./arrayUtils";
import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import { getSectionItemTreeOrThrow, getSectionOrThrow } from "./documentSelectors";
import { buildItemParentMap, getItemOrThrow, isDescendantOfItemSelection } from "./itemTree";
import { useWorkspaceDocument } from "./stores";
import type { WorkspaceItem, WorkspaceSectionItemTree } from "./types";

// The reference's canonical param move (`applyParamMove`/`moveParamsWithBackend`,
// `state/actions/params/moveParams.ts`) minus the app-only branches: the optimistic-op plumbing
// and backend route stay application-side (the document-change callback notifies the host
// instead), and the pinned/unpinned shown-order cache sync (`syncShownParamTopLevelOrder`) left
// with the app — the package derives list membership from the canonical children live. Where
// the reference's monitor and backend keep cyclic drops out of the canonical structure, the
// package funnel is the last line and fails loudly instead. An aborted move (detached items,
// out-of-range index) leaves the canonical tree untouched and does not notify.

type MoveItemsInput = {
  sectionId: string;
  itemIds: Array<string>;
  newParentId: string;
  newIndex: number;
};

type PreparedItemMove = {
  oldParentId: string;
  orderedItemIds: Array<string>;
  remainingOldChildren: Array<string>;
};

export function moveItems({ sectionId, itemIds, newParentId, newIndex }: MoveItemsInput) {
  if (itemIds.length === 0) {
    return;
  }
  const documentState = useWorkspaceDocument.getState();
  const section = getSectionOrThrow(documentState, sectionId);
  const itemTree = getSectionItemTreeOrThrow(documentState, sectionId);
  const nextItemTree = applyItemMove(itemTree, { itemIds, newParentId, newIndex });
  if (nextItemTree === itemTree) {
    return;
  }
  useWorkspaceDocument.setState({
    sections: {
      ...documentState.sections,
      [sectionId]: { ...section, itemTree: nextItemTree },
    },
  });
  notifyWorkspaceDocumentChange();
}

function applyItemMove(
  itemTree: WorkspaceSectionItemTree,
  move: Omit<MoveItemsInput, "sectionId">,
): WorkspaceSectionItemTree {
  const prepared = prepareItemMove(itemTree, move.itemIds);
  if (!prepared) {
    return itemTree;
  }
  if (move.newParentId === prepared.oldParentId) {
    return applySameParentItemMove(itemTree, prepared, move.newIndex);
  }
  return applyCrossParentItemMove(itemTree, move, prepared);
}

function prepareItemMove(
  itemTree: WorkspaceSectionItemTree,
  itemIds: Array<string>,
): PreparedItemMove | null {
  const parentById = buildItemParentMap(itemTree);
  const [firstItemId] = itemIds;
  const oldParentId = firstItemId === undefined ? null : (parentById[firstItemId] ?? null);
  if (!oldParentId) {
    return null;
  }
  const orderedItemIds = orderItemIdsByParent(itemTree, oldParentId, itemIds);
  const itemSet = new Set(orderedItemIds);
  return {
    oldParentId,
    orderedItemIds,
    remainingOldChildren: getItemOrThrow(itemTree, oldParentId).children.filter(
      (id) => !itemSet.has(id),
    ),
  };
}

function applySameParentItemMove(
  itemTree: WorkspaceSectionItemTree,
  move: PreparedItemMove,
  newIndex: number,
): WorkspaceSectionItemTree {
  if (newIndex < 0 || newIndex > move.remainingOldChildren.length) {
    return itemTree;
  }
  return withItemChildren(itemTree, {
    [move.oldParentId]: insertIntoArray(
      move.remainingOldChildren,
      newIndex,
      ...move.orderedItemIds,
    ),
  });
}

function applyCrossParentItemMove(
  itemTree: WorkspaceSectionItemTree,
  move: Omit<MoveItemsInput, "sectionId">,
  prepared: PreparedItemMove,
): WorkspaceSectionItemTree {
  const movingIds = new Set(prepared.orderedItemIds);
  if (isDescendantOfItemSelection(buildItemParentMap(itemTree), move.newParentId, movingIds)) {
    throw new Error(`Cannot move items into their own subtree at ${move.newParentId}.`);
  }
  const newParent = getItemOrThrow(itemTree, move.newParentId);
  const remainingNewChildren = newParent.children.filter((id) => !movingIds.has(id));
  if (move.newIndex < 0 || move.newIndex > remainingNewChildren.length) {
    return itemTree;
  }
  return withItemChildren(itemTree, {
    [prepared.oldParentId]: prepared.remainingOldChildren,
    [move.newParentId]: insertIntoArray(
      remainingNewChildren,
      move.newIndex,
      ...prepared.orderedItemIds,
    ),
  });
}

// The reference keeps a multi-selection in its old-parent document order regardless of the
// order the ids arrive in.
export function orderItemIdsByParent(
  itemTree: WorkspaceSectionItemTree,
  parentId: string,
  itemIds: Array<string>,
): Array<string> {
  const itemSet = new Set(itemIds);
  return getItemOrThrow(itemTree, parentId).children.filter((id) => itemSet.has(id));
}

function withItemChildren(
  itemTree: WorkspaceSectionItemTree,
  childrenByParent: Record<string, Array<string>>,
): WorkspaceSectionItemTree {
  const items: Record<string, WorkspaceItem> = { ...itemTree.items };
  for (const [parentId, children] of Object.entries(childrenByParent)) {
    items[parentId] = { ...getItemOrThrow(itemTree, parentId), children };
  }
  return { ...itemTree, items };
}
