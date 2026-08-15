import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import type { ItemListKey } from "../dnd/itemDndState";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { getSectionItemTreeOrThrow } from "../document/documentSelectors";
import { useItemSelectionMode } from "../document/itemSelectionMode";
import { buildItemTreeView, getItemOrThrow } from "../document/itemTree";
import { useWorkspaceDocument } from "../document/stores";
import type { WorkspaceItem, WorkspaceSectionItemTree } from "../document/types";
import { NATIVE_VERTICAL_WHEEL_CLASS_NAME } from "../interaction";
import { useIsScrollable } from "../useIsScrollable";
import {
  ItemListProvider,
  useItemDndChildrenForParent,
  type ItemRowRenderContext,
} from "./ItemListContext";
import { ItemRow } from "./ItemRow";
import { WorkspaceItemDiagnosticAnnouncer } from "./WorkspaceItemDiagnostics";
import { useWorkspaceItemFilter } from "./WorkspaceItemFilterContext";
import {
  normalizeWorkspaceItemDiagnosticRegistry,
  type WorkspaceItemDiagnosticRegistry,
} from "./itemDiagnostics";
import {
  isItemListViewRegistered,
  registerItemListView,
  unregisterItemListView,
  updateItemListView,
} from "./itemListRegistry";
import { useItemColumnWidth } from "./useItemColumnWidth";

// The reference's `ParamDndList` as the registered item surface: the host mounts one list per
// item area (the reference hard-codes its pinned/unpinned areas), names it with a list key,
// supplies list membership and its visible set, and optionally renders
// custom rows. Typed rows need no renderer. The mounted list registers its live view for drag-start
// resolution. The package-owned per-section filter intersects that membership while preserving
// the list and surviving row identities. List enablement follows the reference: item-select mode,
// the edit-structure capability, and no active filter.

export type WorkspaceItemListProps = {
  sectionId: string;
  listKey: ItemListKey;
  // The list's top-level rows, in order. Every id must be a child of the item tree's root.
  topLevelItemIds: Array<string>;
  // The list-membership seam (the reference's pinned/unpinned shown-param paths): an omitted set
  // includes every item reachable from the top-level rows; an excluded item prunes its subtree.
  visibleItemIds?: Array<string>;
  // Omit for a list made entirely of package-owned typed presentations. A custom opaque row
  // fails specifically at render time when this extension renderer is absent.
  renderItem?: (context: ItemRowRenderContext) => ReactNode;
  // Group rows keep the reference's parent-row layout even when empty. The default is
  // structural for custom items; explicit typed groups always use their presentation kind.
  isGroupItem?: (item: WorkspaceItem) => boolean;
  // Ephemeral host validation for this section, keyed by stable item id. Each replacement is
  // validated as a complete registry and never enters or notifies the canonical document. A
  // diagnosed id deleted before the host's next async render stays dormant until that replacement.
  itemDiagnostics?: WorkspaceItemDiagnosticRegistry;
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

function useResolvedItemVisibility({
  itemTree,
  topLevelItemIds,
  visibleItemIds,
}: {
  itemTree: WorkspaceSectionItemTree;
  topLevelItemIds: Array<string>;
  visibleItemIds: Array<string> | undefined;
}) {
  const itemFilter = useWorkspaceItemFilter();
  const listVisibleSet = useMemo(
    () =>
      visibleItemIds ? new Set(visibleItemIds) : collectReachableItemIds(itemTree, topLevelItemIds),
    [itemTree, topLevelItemIds, visibleItemIds],
  );
  const visibleSet = useMemo(() => {
    if (!itemFilter?.filterActive) {
      return listVisibleSet;
    }
    return new Set([...listVisibleSet].filter((itemId) => itemFilter.visibleItemIds.has(itemId)));
  }, [itemFilter?.filterActive, itemFilter?.visibleItemIds, listVisibleSet]);
  return { filterActive: itemFilter?.filterActive ?? false, listVisibleSet, visibleSet };
}

function useNormalizedItemDiagnostics(
  itemDiagnostics: WorkspaceItemDiagnosticRegistry | undefined,
  sectionId: string,
  itemTree: WorkspaceSectionItemTree,
): WorkspaceItemDiagnosticRegistry {
  const currentItemIds = useMemo(
    () => new Set(Object.keys(itemTree.items).filter((itemId) => itemId !== itemTree.rootId)),
    [itemTree],
  );
  const knownItemIdsRef = useRef<{ itemIds: ReadonlySet<string>; sectionId: string } | null>(null);
  const compatibleItemIds = useMemo(() => {
    const previouslyKnownItemIds =
      itemDiagnostics !== undefined && knownItemIdsRef.current?.sectionId === sectionId
        ? knownItemIdsRef.current.itemIds
        : new Set<string>();
    return new Set([...previouslyKnownItemIds, ...currentItemIds]);
  }, [currentItemIds, itemDiagnostics, sectionId]);
  const normalized = useMemo(
    () => normalizeWorkspaceItemDiagnosticRegistry(itemDiagnostics, sectionId, compatibleItemIds),
    [compatibleItemIds, itemDiagnostics, sectionId],
  );

  // A canonical deletion publishes before an asynchronous host can clear its diagnostic prop.
  // Retain only current ids plus still-supplied, previously valid ids so that one expected state
  // transition stays renderable without allowing an unknown id on first registration.
  useLayoutEffect(() => {
    knownItemIdsRef.current = {
      itemIds: new Set([...currentItemIds, ...Object.keys(normalized)]),
      sectionId,
    };
  }, [currentItemIds, normalized, sectionId]);
  return normalized;
}

export function WorkspaceItemList({
  sectionId,
  listKey,
  topLevelItemIds,
  visibleItemIds,
  renderItem,
  isGroupItem = defaultIsGroupItem,
  itemDiagnostics,
}: WorkspaceItemListProps) {
  const itemTree = useWorkspaceDocument((x) => getSectionItemTreeOrThrow(x, sectionId));
  const isSelectingItems = useItemSelectionMode((x) => x.isSelectingItems);
  const canEditStructure = useWorkspaceCapabilities((x) => x.canEditStructure);
  const { filterActive, listVisibleSet, visibleSet } = useResolvedItemVisibility({
    itemTree,
    topLevelItemIds,
    visibleItemIds,
  });
  const enabled = isSelectingItems && canEditStructure && !filterActive;
  const normalizedItemDiagnostics = useNormalizedItemDiagnostics(
    itemDiagnostics,
    sectionId,
    itemTree,
  );
  const listOuterRef = useRef<HTMLDivElement | null>(null);
  const columnResizeHandlers = useItemColumnWidth(sectionId, listOuterRef);
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
      itemDiagnostics={normalizedItemDiagnostics}
      renderItem={renderItem}
      isGroupItem={isGroupItem}
      {...columnResizeHandlers}
      keyboardColumnResizeItemId={treeView.flat[0]?.id ?? null}
      rootId={treeView.rootId}
      flatItemIds={treeView.flat.map((row) => row.id)}
    >
      <WorkspaceItemDiagnosticAnnouncer
        diagnostics={normalizedItemDiagnostics}
        itemIds={listVisibleSet}
        itemTree={itemTree}
      />
      <ItemListShell filterActive={filterActive} outerRef={listOuterRef}>
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
// the row rhythm; a scrollable list keeps vertical wheel behavior while horizontal wheel input
// still pans the canvas. The
// reference's persisted min-height measurement stays application-side. The reference string
// carries a `grid-cols-subgrid` its own stylesheet outranks with `.section-args-nested`; the
// port drops that computed-dead utility so a host sheet loaded after the package sheet cannot
// flip the winner across the package boundary.
function ItemListShell({
  children,
  filterActive,
  outerRef,
}: {
  children: ReactNode;
  filterActive: boolean;
  outerRef: RefObject<HTMLDivElement | null>;
}) {
  const { ref, isScrollable } = useIsScrollable();
  const preservedScrollTopRef = useRef(0);
  const previousFilterActiveRef = useRef(filterActive);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const wasFilterActive = previousFilterActiveRef.current;
    if (!wasFilterActive && filterActive) {
      preservedScrollTopRef.current = node.scrollTop;
    } else if (wasFilterActive && !filterActive) {
      node.scrollTop = preservedScrollTopRef.current;
    }
    previousFilterActiveRef.current = filterActive;
  }, [filterActive, ref]);

  return (
    <div ref={outerRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className={`section-args-nested grid min-h-0 min-w-0 !max-w-full flex-1 auto-rows-min content-start gap-y-1 overflow-x-clip overflow-y-scroll py-2 pe-1.5 ${
          isScrollable ? NATIVE_VERTICAL_WHEEL_CLASS_NAME : ""
        }`}
        onScroll={(event) => {
          if (!filterActive) {
            preservedScrollTopRef.current = event.currentTarget.scrollTop;
          }
        }}
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
  const itemFilter = useWorkspaceItemFilter();

  if (renderItemIds.length === 0 && itemFilter?.filterActive) {
    const textToneClassName = itemFilter.hasSectionStyleTheme
      ? "text-[color:var(--setta-section-style-muted-text)]"
      : "text-setta-500 dark:text-setta-400";
    const buttonToneClassName = itemFilter.hasSectionStyleTheme
      ? "border-[color:var(--setta-section-style-border)] text-[color:var(--setta-section-style-text)]"
      : "border-setta-200 text-setta-600 dark:border-setta-700 dark:text-setta-300";
    return (
      <div
        className={`col-span-full mx-2 flex min-w-0 flex-col items-center gap-2 py-4 text-center text-xs ${textToneClassName}`}
      >
        <p className="min-w-0 break-words">
          No parameters in this list match{" "}
          <span className="font-medium">“{itemFilter.query}”.</span>
        </p>
        <button
          className={`min-h-6 rounded-sm border px-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 ${buttonToneClassName}`}
          data-tab-native="true"
          data-setta-workspace-touch-target="compact"
          onClick={itemFilter.clearAndFocus}
          type="button"
        >
          Clear filter
        </button>
      </div>
    );
  }

  return renderItemIds.map((itemId, index) => (
    <ItemRow key={itemId} itemId={itemId} isTopLevelWithPad={index > 0} />
  ));
}
