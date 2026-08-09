import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "../state/storeUtils";

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

export const useItemDndState = createWithEqualityFn(
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

export function setItemDndState(nextState: Partial<ItemDndState>) {
  useItemDndState.setState(nextState);
}

// The reference's `resetParamDndState` wrapper returns with the monitor batch that owns the
// drag-lifecycle reset path.

const ITEM_DND_LIST_KEY_SEPARATOR = "::settaParamList::";
const ITEM_DND_TEMP_SUFFIX = "::TempParamDND";

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
