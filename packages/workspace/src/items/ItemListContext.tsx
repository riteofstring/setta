import _ from "lodash";
import {
  createContext,
  useContext,
  useMemo,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import { SortableContext, verticalListSortingStrategy } from "../dnd/adapter";
import { useItemDndChildren } from "../dnd/itemDndChildren";
import { getItemDndId, isTempItem, useItemDndState, type ItemListKey } from "../dnd/itemDndState";
import type { WorkspaceItem } from "../document/types";
import type { WorkspaceItemDiagnosticRegistry } from "./itemDiagnostics";

// The reference's app-level `ParamDndContext` (list context, `useParamDndChildrenForParent`,
// and the `ParamDndProvider` sortable list). The package context additionally carries the
// optional custom-row renderer, group predicate, and visible set. Typed rows render directly;
// custom opaque rows read their host extension from this context at any recursive depth.

export type ItemRowRenderContext = {
  sectionId: string;
  listKey: ItemListKey;
  item: WorkspaceItem;
  isSelected: boolean;
};

type ItemListContextValue = {
  enabled: boolean;
  sectionId: string;
  listKey: ItemListKey;
  visibleItemIds: ReadonlySet<string>;
  itemDiagnostics: WorkspaceItemDiagnosticRegistry;
  renderItem?: (context: ItemRowRenderContext) => ReactNode;
  isGroupItem: (item: WorkspaceItem) => boolean;
  onColumnResizeStart: PointerEventHandler<HTMLButtonElement>;
  onColumnResizeKeyDown: KeyboardEventHandler<HTMLButtonElement>;
  onColumnResizeClick: MouseEventHandler<HTMLButtonElement>;
  onColumnResizeDoubleClick: MouseEventHandler<HTMLButtonElement>;
  keyboardColumnResizeItemId: string | null;
};

const ItemListContext = createContext<ItemListContextValue | null>(null);

export function useItemListContext(): ItemListContextValue {
  const context = useContext(ItemListContext);
  if (!context) {
    throw new Error("Item rows must render inside a WorkspaceItemList.");
  }
  return context;
}

export function useItemDndChildrenForParent(parentId: string, fallback: Array<string>) {
  const context = useContext(ItemListContext);
  const { activeId, sectionId, listKey } = useItemDndState(
    (state) => ({
      activeId: state.activeId,
      sectionId: state.sectionId,
      listKey: state.listKey,
    }),
    _.isEqual,
  );
  const isActiveList = Boolean(
    context && activeId && sectionId === context.sectionId && listKey === context.listKey,
  );
  const tempChildren = useItemDndChildren(
    (state) => (isActiveList ? (state.x[parentId] ?? null) : null),
    _.isEqual,
  );
  return tempChildren ?? fallback;
}

type ItemListProviderProps = ItemListContextValue & {
  rootId: string;
  flatItemIds: Array<string>;
  children: ReactNode;
};

export function ItemListProvider({
  enabled,
  sectionId,
  listKey,
  visibleItemIds,
  itemDiagnostics,
  renderItem,
  isGroupItem,
  onColumnResizeStart,
  onColumnResizeKeyDown,
  onColumnResizeClick,
  onColumnResizeDoubleClick,
  keyboardColumnResizeItemId,
  rootId,
  flatItemIds,
  children,
}: ItemListProviderProps) {
  const contextValue = useMemo(
    () => ({
      enabled,
      sectionId,
      listKey,
      visibleItemIds,
      itemDiagnostics,
      renderItem,
      isGroupItem,
      onColumnResizeStart,
      onColumnResizeKeyDown,
      onColumnResizeClick,
      onColumnResizeDoubleClick,
      keyboardColumnResizeItemId,
    }),
    [
      enabled,
      isGroupItem,
      keyboardColumnResizeItemId,
      listKey,
      itemDiagnostics,
      onColumnResizeClick,
      onColumnResizeDoubleClick,
      onColumnResizeKeyDown,
      onColumnResizeStart,
      renderItem,
      sectionId,
      visibleItemIds,
    ],
  );
  const activeInfo = useItemDndState(
    (state) => ({
      activeId: state.activeId,
      sectionId: state.sectionId,
      listKey: state.listKey,
    }),
    _.isEqual,
  );
  const isActiveList =
    Boolean(activeInfo.activeId) &&
    activeInfo.sectionId === sectionId &&
    activeInfo.listKey === listKey;
  const tempChildren = useItemDndChildren((state) => (isActiveList ? state.x : null), _.isEqual);

  const items = useMemo(() => {
    const toDndId = (id: string) => (isTempItem(id) ? id : getItemDndId(id, listKey));
    if (isActiveList && tempChildren) {
      return flattenItemChildren(rootId, tempChildren).map(toDndId);
    }
    return flatItemIds.map(toDndId);
  }, [flatItemIds, isActiveList, listKey, rootId, tempChildren]);

  // Frozen main keeps this provider mounted while item-select mode toggles and disables each
  // row's sortable registration through the context flag. Preserving that element identity is
  // also what keeps a constrained list's live scroll position when Mod+Shift is pressed.
  return (
    <ItemListContext.Provider value={contextValue}>
      <SortableContext
        id={`${sectionId}:${listKey}`}
        items={items}
        strategy={verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
    </ItemListContext.Provider>
  );
}

function flattenItemChildren(rootId: string, childrenByParent: Record<string, Array<string>>) {
  const flat: Array<string> = [];

  function walk(parentId: string) {
    const children = childrenByParent[parentId] ?? [];
    for (const childId of children) {
      flat.push(childId);
      walk(childId);
    }
  }

  walk(rootId);
  return flat;
}
