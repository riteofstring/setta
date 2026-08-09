import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { ItemListKey } from "../dnd/itemDndState";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { getSectionItemTreeOrThrow } from "../document/documentSelectors";
import { useItemSelectionMode } from "../document/itemSelectionMode";
import { buildItemTreeView, getItemOrThrow } from "../document/itemTree";
import { useWorkspaceDocument } from "../document/stores";
import type { WorkspaceItem, WorkspaceSectionItemTree } from "../document/types";
import {
  ItemListProvider,
  useItemDndChildrenForParent,
  type ItemRowRenderContext,
} from "./ItemListContext";
import { ItemRow } from "./ItemRow";
import {
  isItemListViewRegistered,
  registerItemListView,
  unregisterItemListView,
  updateItemListView,
} from "./itemListRegistry";

// The reference's `ParamDndList` as the registered item surface: the host mounts one list per
// item area (the reference hard-codes its pinned/unpinned areas), names it with a list key,
// supplies list membership, the visible set (the filtered-list seam), and the row renderer,
// and the mounted list registers its live view for drag-start resolution. List enablement
// follows the reference: item-select mode, the edit-structure capability, and no active
// filter.

export type WorkspaceItemListProps = {
  sectionId: string;
  listKey: ItemListKey;
  // The list's top-level rows, in order. Every id must be a child of the item tree's root.
  topLevelItemIds: Array<string>;
  // The filtered-list seam (the reference's shown-param paths): an omitted set shows every
  // item reachable from the top-level rows; an invisible item prunes its whole subtree.
  visibleItemIds?: Array<string>;
  // The reference disables param dnd while its param filter is active; hosts report the
  // equivalent for their own filtering.
  filterActive?: boolean;
  renderItem: (context: ItemRowRenderContext) => ReactNode;
  // Group rows keep the reference's parent-row layout even when empty. The default is
  // structural; hosts whose leaf-versus-group distinction lives in their opaque item data
  // supply the predicate.
  isGroupItem?: (item: WorkspaceItem) => boolean;
};

function collectReachableItemIds(
  itemTree: WorkspaceSectionItemTree,
  topLevelItemIds: Array<string>,
): Set<string> {
  const reachable = new Set<string>();

  function walk(itemId: string) {
    reachable.add(itemId);
    for (const childId of getItemOrThrow(itemTree, itemId).children) {
      walk(childId);
    }
  }

  for (const itemId of topLevelItemIds) {
    walk(itemId);
  }
  return reachable;
}

function defaultIsGroupItem(item: WorkspaceItem): boolean {
  return item.children.length > 0;
}

export function WorkspaceItemList({
  sectionId,
  listKey,
  topLevelItemIds,
  visibleItemIds,
  filterActive = false,
  renderItem,
  isGroupItem = defaultIsGroupItem,
}: WorkspaceItemListProps) {
  const itemTree = useWorkspaceDocument((x) => getSectionItemTreeOrThrow(x, sectionId));
  const isSelectingItems = useItemSelectionMode((x) => x.isSelectingItems);
  const canEditStructure = useWorkspaceCapabilities((x) => x.canEditStructure);
  const enabled = isSelectingItems && canEditStructure && !filterActive;

  const visibleSet = useMemo(
    () =>
      visibleItemIds ? new Set(visibleItemIds) : collectReachableItemIds(itemTree, topLevelItemIds),
    [itemTree, topLevelItemIds, visibleItemIds],
  );
  const treeView = useMemo(
    () => buildItemTreeView(itemTree, topLevelItemIds, visibleSet),
    [itemTree, topLevelItemIds, visibleSet],
  );

  const view = useMemo(
    () => ({ listKey, topLevelItemIds, visibleItemIds: visibleSet, filterActive }),
    [filterActive, listKey, topLevelItemIds, visibleSet],
  );
  const viewRef = useRef(view);

  // Keeps the latest view for the registration effect below and refreshes a live
  // registration in place, so re-renders never change the section's mount order.
  useEffect(() => {
    viewRef.current = view;
    if (isItemListViewRegistered(sectionId, view.listKey)) {
      updateItemListView(sectionId, view);
    }
  }, [sectionId, view]);

  useEffect(() => {
    registerItemListView(sectionId, viewRef.current);
    return () => unregisterItemListView(sectionId, listKey);
  }, [sectionId, listKey]);

  return (
    <ItemListProvider
      enabled={enabled}
      sectionId={sectionId}
      listKey={listKey}
      visibleItemIds={visibleSet}
      renderItem={renderItem}
      isGroupItem={isGroupItem}
      rootId={treeView.rootId}
      flatItemIds={treeView.flat.map((row) => row.id)}
    >
      <ItemListBody
        rootId={treeView.rootId}
        topLevelRowIds={treeView.visibleChildrenByParent[treeView.rootId] ?? []}
      />
    </ItemListProvider>
  );
}

function ItemListBody({
  rootId,
  topLevelRowIds,
}: {
  rootId: string;
  topLevelRowIds: Array<string>;
}) {
  const renderItemIds = useItemDndChildrenForParent(rootId, topLevelRowIds);

  return renderItemIds.map((itemId, index) => (
    <ItemRow key={itemId} itemId={itemId} isTopLevelWithPad={index > 0} />
  ));
}
