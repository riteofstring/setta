import {
  assertNoReservedItemDndTokens,
  type ItemListKey,
} from "../dnd/itemDndState";

// The registered-list-view half of the Phase 4 item surface. The reference resolves a drag's
// list view from application state (`getParamListView` over its hard-coded pinned/unpinned
// areas, `resolveParamListView` falling back pinned-then-unpinned); the package resolves it
// from the list views the host has mounted: every `WorkspaceItemList` registers its live view
// here, and drag start looks the active item up by the drag's list key first, then the
// section's other registered lists in mount order.

export type RegisteredItemListView = {
  listKey: ItemListKey;
  topLevelItemIds: Array<string>;
  // The resolved list membership after package filtering: the reference's
  // `requiredParamIdsToPaths` keys. Drag start requires the active item to be visible.
  visibleItemIds: ReadonlySet<string>;
  // The reference disables param dnd while a param filter is active. The package filter owner
  // publishes that answer through each live list view.
  filterActive: boolean;
};

const registeredListViewsBySection = new Map<
  string,
  Map<ItemListKey, RegisteredItemListView>
>();

export function registerItemListView(
  sectionId: string,
  view: RegisteredItemListView,
): void {
  assertNoReservedItemDndTokens(view.listKey, "item list key");
  const views = registeredListViewsBySection.get(sectionId) ?? new Map();
  if (views.has(view.listKey)) {
    throw new Error(
      `item list key "${view.listKey}" is already registered for section "${sectionId}"`,
    );
  }
  views.set(view.listKey, view);
  registeredListViewsBySection.set(sectionId, views);
}

export function isItemListViewRegistered(
  sectionId: string,
  listKey: ItemListKey,
): boolean {
  return registeredListViewsBySection.get(sectionId)?.has(listKey) ?? false;
}

// Replaces a live registration in place: `Map.set` on an existing key keeps the section's
// mount order, so a re-rendering list never migrates to the end of the resolution fallback.
export function updateItemListView(
  sectionId: string,
  view: RegisteredItemListView,
): void {
  const views = registeredListViewsBySection.get(sectionId);
  if (!views?.has(view.listKey)) {
    throw new Error(
      `item list key "${view.listKey}" is not registered for section "${sectionId}"`,
    );
  }
  views.set(view.listKey, view);
}

export function unregisterItemListView(
  sectionId: string,
  listKey: ItemListKey,
): void {
  const views = registeredListViewsBySection.get(sectionId);
  if (!views) {
    return;
  }
  views.delete(listKey);
  if (views.size === 0) {
    registeredListViewsBySection.delete(sectionId);
  }
}

export function resolveItemListView(
  sectionId: string,
  activeItemId: string,
  listKey: ItemListKey | null,
): RegisteredItemListView | null {
  const views = registeredListViewsBySection.get(sectionId);
  if (!views) {
    return null;
  }
  if (listKey) {
    const view = views.get(listKey);
    if (view && view.visibleItemIds.has(activeItemId)) {
      return view;
    }
  }
  for (const view of views.values()) {
    if (view.listKey !== listKey && view.visibleItemIds.has(activeItemId)) {
      return view;
    }
  }
  return null;
}

// The keyboard-move half of the visibility seam: the reference reads its shown-param state
// directly (`getCurrShownParamIds` union minus edge params), the package unions the mounted
// list views. No registered views means the package cannot see any rows, so keyboard moves
// stay disabled — the same answer the drag path gives through `resolveItemListView`.
type SectionItemVisibility = {
  visibleItemIds: Set<string>;
  filterActive: boolean;
};

export function getSectionItemVisibility(
  sectionId: string,
): SectionItemVisibility | null {
  const views = registeredListViewsBySection.get(sectionId);
  if (!views) {
    return null;
  }
  const visibleItemIds = new Set<string>();
  let filterActive = false;
  for (const view of views.values()) {
    for (const itemId of view.visibleItemIds) {
      visibleItemIds.add(itemId);
    }
    filterActive = filterActive || view.filterActive;
  }
  return { visibleItemIds, filterActive };
}

export function resetItemListViews(): void {
  registeredListViewsBySection.clear();
}
