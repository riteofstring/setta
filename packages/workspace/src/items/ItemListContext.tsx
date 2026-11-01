import _ from "lodash";
import {
  createContext,
  useContext,
  useMemo,
  type MouseEventHandler,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "../dnd/adapter/index.js";
import { useItemDndChildren } from "../dnd/itemDndChildren.js";
import {
  getItemDndId,
  isTempItem,
  useItemDndState,
  type ItemListKey,
} from "../dnd/itemDndState.js";
import type { WorkspaceItem } from "../document/types.js";
import type { WorkspaceItemDiagnosticRegistry } from "./itemDiagnostics.js";

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
  onColumnResizeDoubleClick: MouseEventHandler<HTMLButtonElement>;
};

const ItemListContext = createContext<ItemListContextValue | null>(null);

export function useItemListContext(): ItemListContextValue {
  const context = useContext(ItemListContext);
  if (!context) {
    throw new Error("Item rows must render inside a WorkspaceItemList.");
  }
  return context;
}

export function useItemDndChildrenForParent(
  parentId: string,
  fallback: Array<string>,
) {
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
    context &&
    activeId &&
    sectionId === context.sectionId &&
    listKey === context.listKey,
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
  onColumnResizeDoubleClick,
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
      onColumnResizeDoubleClick,
    }),
    [
      enabled,
      isGroupItem,
      listKey,
      itemDiagnostics,
      onColumnResizeDoubleClick,
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
  const tempChildren = useItemDndChildren(
    (state) => (isActiveList ? state.x : null),
    _.isEqual,
  );

  const items = useMemo(() => {
    const toDndId = (id: string) =>
      isTempItem(id) ? id : getItemDndId(id, listKey);
    if (isActiveList && tempChildren) {
      return flattenItemChildren(rootId, tempChildren).map(toDndId);
    }
    return flatItemIds.map(toDndId);
  }, [flatItemIds, isActiveList, listKey, rootId, tempChildren]);

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

function flattenItemChildren(
  rootId: string,
  childrenByParent: Record<string, Array<string>>,
) {
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
