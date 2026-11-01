import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import type { ItemListKey } from "../dnd/itemDndState.js";
import { useWorkspaceCapabilities } from "../document/capabilities.js";
import { getSectionItemTreeOrThrow } from "../document/documentSelectors.js";
import { buildItemTreeView, getItemOrThrow } from "../document/itemTree.js";
import { useWorkspaceDocument } from "../document/stores.js";
import type {
  WorkspaceItem,
  WorkspaceSectionItemTree,
} from "../document/types.js";
import { NATIVE_VERTICAL_WHEEL_CLASS_NAME } from "../interaction.js";
import { useIsScrollable } from "../useIsScrollable.js";
import {
  ItemListProvider,
  useItemDndChildrenForParent,
  type ItemRowRenderContext,
} from "./ItemListContext.js";
import { ItemRow } from "./ItemRow.js";
import { WorkspaceItemDiagnosticAnnouncer } from "./WorkspaceItemDiagnostics.js";
import { useWorkspaceItemFilter } from "./WorkspaceItemFilterContext.js";
import {
  normalizeWorkspaceItemDiagnosticRegistry,
  type WorkspaceItemDiagnosticRegistry,
} from "./itemDiagnostics.js";
import {
  isItemListViewRegistered,
  registerItemListView,
  unregisterItemListView,
  updateItemListView,
} from "./itemListRegistry.js";
import { useItemColumnWidth } from "./useItemColumnWidth.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";

export type WorkspaceItemListProps = {
  sectionId: string;
  listKey: ItemListKey;

  topLevelItemIds: Array<string>;

  visibleItemIds?: Array<string>;

  renderItem?: (context: ItemRowRenderContext) => ReactNode;

  isGroupItem?: (item: WorkspaceItem) => boolean;

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
      visibleItemIds
        ? new Set(visibleItemIds)
        : collectReachableItemIds(itemTree, topLevelItemIds),
    [itemTree, topLevelItemIds, visibleItemIds],
  );
  const visibleSet = useMemo(() => {
    if (!itemFilter?.filterActive) {
      return listVisibleSet;
    }
    return new Set(
      [...listVisibleSet].filter((itemId) =>
        itemFilter.visibleItemIds.has(itemId),
      ),
    );
  }, [itemFilter?.filterActive, itemFilter?.visibleItemIds, listVisibleSet]);
  return {
    filterActive: itemFilter?.filterActive ?? false,
    listVisibleSet,
    visibleSet,
  };
}

function useNormalizedItemDiagnostics(
  itemDiagnostics: WorkspaceItemDiagnosticRegistry | undefined,
  sectionId: string,
  itemTree: WorkspaceSectionItemTree,
): WorkspaceItemDiagnosticRegistry {
  const currentItemIds = useMemo(
    () =>
      new Set(
        Object.keys(itemTree.items).filter(
          (itemId) => itemId !== itemTree.rootId,
        ),
      ),
    [itemTree],
  );
  const knownItemIdsRef = useRef<{
    itemIds: ReadonlySet<string>;
    sectionId: string;
  } | null>(null);
  const compatibleItemIds = useMemo(() => {
    const previouslyKnownItemIds =
      itemDiagnostics !== undefined &&
      knownItemIdsRef.current?.sectionId === sectionId
        ? knownItemIdsRef.current.itemIds
        : new Set<string>();
    return new Set([...previouslyKnownItemIds, ...currentItemIds]);
  }, [currentItemIds, itemDiagnostics, sectionId]);
  const normalized = useMemo(
    () =>
      normalizeWorkspaceItemDiagnosticRegistry(
        itemDiagnostics,
        sectionId,
        compatibleItemIds,
      ),
    [compatibleItemIds, itemDiagnostics, sectionId],
  );

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
  const host = useWorkspaceHost();
  const itemTree = useWorkspaceDocument((x) =>
    getSectionItemTreeOrThrow(x, sectionId),
  );
  const canEditStructure = useWorkspaceCapabilities((x) => x.canEditStructure);
  const { filterActive, listVisibleSet, visibleSet } =
    useResolvedItemVisibility({
      itemTree,
      topLevelItemIds,
      visibleItemIds,
    });
  const enabled = canEditStructure && !filterActive;
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
    () => ({
      listKey,
      topLevelItemIds,
      visibleItemIds: visibleSet,
      filterActive,
    }),
    [filterActive, listKey, topLevelItemIds, visibleSet],
  );
  const viewRef = useRef(view);

  useEffect(() => {
    viewRef.current = view;
    if (isItemListViewRegistered(host, sectionId, view.listKey)) {
      updateItemListView(host, sectionId, view);
    }
  }, [host, sectionId, view]);

  useEffect(() => {
    registerItemListView(host, sectionId, viewRef.current);
    return () => unregisterItemListView(host, sectionId, listKey);
  }, [host, sectionId, listKey]);

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
          topLevelRowIds={
            treeView.visibleChildrenByParent[treeView.rootId] ?? []
          }
        />
      </ItemListShell>
    </ItemListProvider>
  );
}

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

    if (wasFilterActive && !filterActive) {
      node.scrollTop = preservedScrollTopRef.current;
    }
    previousFilterActiveRef.current = filterActive;
  }, [filterActive, ref]);

  return (
    <div
      ref={outerRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
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
