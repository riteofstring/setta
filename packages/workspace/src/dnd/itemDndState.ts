import { createStore } from "zustand/vanilla";
import { withResetFn } from "../state/storeUtils.js";
import {
  useWorkspaceHost,
  useWorkspaceStore,
} from "../workspaceHostContext.js";
import { createHostStoreGetter } from "../state/hostStore.js";
import type { WorkspaceHost } from "../workspaceHost.js";

export type ItemListKey = string;

type ItemDndState = {
  activeId: string | null;
  isHandleDrag: boolean;
  sectionId: string | null;
  listKey: ItemListKey | null;
  rootId: string | null;
  draggingIds: Array<string>;
  pendingReset: boolean;
  parentById: Record<string, string | null>;
  visibleChildrenByParent: Record<string, Array<string>>;
  activeRect: {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null;
  placeholderWidth: number | null;
  placeholderHeight: number | null;
};

function createItemDndStateStore() {
  return createStore(
    withResetFn<ItemDndState>(() => ({
      activeId: null,
      isHandleDrag: false,
      sectionId: null,
      listKey: null,
      rootId: null,
      draggingIds: [],
      pendingReset: false,
      parentById: {},
      visibleChildrenByParent: {},
      activeRect: null,
      placeholderWidth: null,
      placeholderHeight: null,
    })),
  );
}

export const getItemDndStateStore = createHostStoreGetter(
  createItemDndStateStore,
);

export function useItemDndState<T>(
  selector: (state: ItemDndState) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useWorkspaceStore(
    getItemDndStateStore(useWorkspaceHost()),
    selector,
    equalityFn,
  );
}

export function setItemDndState(
  host: WorkspaceHost,
  nextState: Partial<ItemDndState>,
) {
  getItemDndStateStore(host).setState(nextState);
}

export function resetItemDndState(host: WorkspaceHost) {
  getItemDndStateStore(host).getState().reset();
}

const ITEM_DND_LIST_KEY_SEPARATOR = "::settaParamList::";
const ITEM_DND_TEMP_SUFFIX = "::TempParamDND";

export function assertNoReservedItemDndTokens(
  value: string,
  role: string,
): void {
  for (const token of [ITEM_DND_LIST_KEY_SEPARATOR, ITEM_DND_TEMP_SUFFIX]) {
    if (value.includes(token)) {
      throw new Error(
        `${role} "${value}" contains the reserved dnd token "${token}".`,
      );
    }
  }
}

export function getItemDndId(itemId: string, listKey: ItemListKey) {
  return `${itemId}${ITEM_DND_LIST_KEY_SEPARATOR}${listKey}`;
}

export function getItemIdFromDndId(dndId: string): string {
  const base = stripTempSuffix(dndId);
  const separatorIndex = base.lastIndexOf(ITEM_DND_LIST_KEY_SEPARATOR);
  if (separatorIndex === -1) {
    return base;
  }
  return base.slice(0, separatorIndex);
}

export function getTempItemDndId(dndId: string) {
  return `${dndId}${ITEM_DND_TEMP_SUFFIX}`;
}

export function isTempItem(itemId: string) {
  return itemId.endsWith(ITEM_DND_TEMP_SUFFIX);
}

function stripTempSuffix(itemId: string) {
  if (!isTempItem(itemId)) {
    return itemId;
  }
  return itemId.slice(0, -ITEM_DND_TEMP_SUFFIX.length);
}
