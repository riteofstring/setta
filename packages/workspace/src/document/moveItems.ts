import { insertIntoArray } from "./arrayUtils";
import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import {
  getSectionItemTreeOrThrow,
  getSectionOrThrow,
} from "./documentSelectors";
import {
  buildItemParentMap,
  getItemOrThrow,
  isDescendantOfItemSelection,
} from "./itemTree";
import { getWorkspaceDocumentStore } from "./stores";
import type { WorkspaceItem, WorkspaceSectionItemTree } from "./types";
import type { WorkspaceHost } from "../workspaceHost";

export type ItemTreeMove = {
  itemIds: Array<string>;
  newParentId: string;
  newIndex: number;
};

type MoveItemsInput = ItemTreeMove & { sectionId: string };

type PreparedItemMove = {
  oldParentId: string;
  orderedItemIds: Array<string>;
  remainingOldChildren: Array<string>;
};

export function moveItems(
  host: WorkspaceHost,
  { sectionId, itemIds, newParentId, newIndex }: MoveItemsInput,
) {
  if (itemIds.length === 0) {
    return;
  }
  const itemTree = getSectionItemTreeOrThrow(
    getWorkspaceDocumentStore(host).getState(),
    sectionId,
  );
  commitSectionItemTree(
    host,
    sectionId,
    applyItemMoveToTree(itemTree, { itemIds, newParentId, newIndex }),
  );
}

export function commitSectionItemTree(
  host: WorkspaceHost,
  sectionId: string,
  nextItemTree: WorkspaceSectionItemTree,
) {
  const documentStore = getWorkspaceDocumentStore(host);
  const documentState = documentStore.getState();
  const section = getSectionOrThrow(documentState, sectionId);
  if (getSectionItemTreeOrThrow(documentState, sectionId) === nextItemTree) {
    return;
  }
  documentStore.setState({
    sections: {
      ...documentState.sections,
      [sectionId]: { ...section, itemTree: nextItemTree },
    },
  });
  notifyWorkspaceDocumentChange(host, "item-move");
}

export function applyItemMoveToTree(
  itemTree: WorkspaceSectionItemTree,
  move: ItemTreeMove,
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
  const oldParentId =
    firstItemId === undefined ? null : (parentById[firstItemId] ?? null);
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
  move: ItemTreeMove,
  prepared: PreparedItemMove,
): WorkspaceSectionItemTree {
  const movingIds = new Set(prepared.orderedItemIds);
  if (
    isDescendantOfItemSelection(
      buildItemParentMap(itemTree),
      move.newParentId,
      movingIds,
    )
  ) {
    throw new Error(
      `Cannot move items into their own subtree at ${move.newParentId}.`,
    );
  }
  const newParent = getItemOrThrow(itemTree, move.newParentId);
  const remainingNewChildren = newParent.children.filter(
    (id) => !movingIds.has(id),
  );
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

export function orderItemIdsByParent(
  itemTree: WorkspaceSectionItemTree,
  parentId: string,
  itemIds: Array<string>,
): Array<string> {
  const itemSet = new Set(itemIds);
  return getItemOrThrow(itemTree, parentId).children.filter((id) =>
    itemSet.has(id),
  );
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
