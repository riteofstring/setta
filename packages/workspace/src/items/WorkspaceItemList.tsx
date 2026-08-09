import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import type { ItemListKey } from "../dnd/itemDndState";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { getSectionItemTreeOrThrow } from "../document/documentSelectors";
import { useItemSelectionMode } from "../document/itemSelectionMode";
import { buildItemTreeView, getItemOrThrow } from "../document/itemTree";
import { useWorkspaceDocument } from "../document/stores";
import type { WorkspaceItem, WorkspaceSectionItemTree } from "../document/types";
import { NO_WHEEL_CLASS_NAME } from "../interaction";
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
import { useIsScrollable } from "./useIsScrollable";
import { useItemColumnWidth } from "./useItemColumnWidth";

// The reference's `ParamDndList` as the registered item surface: the host mounts one list per
// item area (the reference hard-codes its pinned/unpinned areas), names it with a list key,
// supplies list membership and the visible set (the filtered-list seam), and optionally renders
// custom rows. Typed rows need no renderer. The mounted list registers its live view for drag-start
// resolution. List enablement
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
  // Omit for a list made entirely of package-owned typed presentations. A custom opaque row
  // fails specifically at render time when this extension renderer is absent.
  renderItem?: (context: ItemRowRenderContext) => ReactNode;
  // Group rows keep the reference's parent-row layout even when empty. The default is
  // structural for custom items; explicit typed groups always use their presentation kind.
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
  const listOuterRef = useRef<HTMLDivElement | null>(null);
  const columnResizeHandlers = useItemColumnWidth(sectionId, listOuterRef);

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
      {...columnResizeHandlers}
      keyboardColumnResizeItemId={treeView.flat[0]?.id ?? null}
      rootId={treeView.rootId}
      flatItemIds={treeView.flat.map((row) => row.id)}
    >
      <ItemListShell outerRef={listOuterRef}>
        <ItemListBody
          rootId={treeView.rootId}
          topLevelRowIds={treeView.visibleChildrenByParent[treeView.rootId] ?? []}
        />
      </ItemListShell>
    </ItemListProvider>
  );
}

// The reference's list-area shell (`GetUnpinnedParams`): the outer column clips, and the inner
// named nested grid owns the row placement lines the row classes reference, the scrolling, and
// the row rhythm; a scrollable list keeps its own wheel behavior instead of canvas zoom. The
// reference's persisted min-height measurement stays application-side. The reference string
// carries a `grid-cols-subgrid` its own stylesheet outranks with `.section-args-nested`; the
// port drops that computed-dead utility so a host sheet loaded after the package sheet cannot
// flip the winner across the package boundary.
function ItemListShell({
  children,
  outerRef,
}: {
  children: ReactNode;
  outerRef: RefObject<HTMLDivElement | null>;
}) {
  const { ref, isScrollable } = useIsScrollable();
  return (
    <div ref={outerRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className={`section-args-nested grid min-h-0 min-w-0 !max-w-full flex-1 auto-rows-min content-start gap-y-1 overflow-x-clip overflow-y-scroll py-2 pe-1.5 ${
          isScrollable ? NO_WHEEL_CLASS_NAME : ""
        }`}
        ref={ref}
      >
        {children}
      </div>
    </div>
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
