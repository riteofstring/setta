import { createStore } from "zustand/vanilla";
import { withResetFn } from "../state/storeUtils";
import { useWorkspaceHost, useWorkspaceStore } from "../workspaceHostContext";
import { assertWorkspaceHostActive } from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";

// The reference's param dnd bookkeeping store (`paramDndState.ts`), written in the package store
// style (plain setState instead of the reference's immer middleware; identical observable state).
// The package term for the reference's params is "items", and list keys are host-defined strings
// where the reference hard-codes its pinned/unpinned param areas. The dnd-id wire constants stay
// verbatim so the id encoding matches the reference exactly.

export type ItemListKey = string;

type ItemDndState = {
  activeId: string | null;
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

const storesByHost = new WeakMap<
  WorkspaceHost,
  ReturnType<typeof createItemDndStateStore>
>();

export function getItemDndStateStore(host: WorkspaceHost) {
  assertWorkspaceHostActive(host);
  const existing = storesByHost.get(host);
  if (existing) {
    return existing;
  }
  const store = createItemDndStateStore();
  storesByHost.set(host, store);
  return store;
}

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

// Host-defined item ids and list keys ride the dnd-id encoding verbatim (the reference is
// immune: its list keys are the closed pinned/unpinned union and its param ids are
// app-generated). A value containing a reserved token would decode as the wrong item or
// classify a real row as the temp placeholder, so the entry seams — document load and list
// registration — fail loudly instead.
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
