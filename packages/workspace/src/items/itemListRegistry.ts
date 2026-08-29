import {
  assertNoReservedItemDndTokens,
  type ItemListKey,
} from "../dnd/itemDndState";
import type { WorkspaceHost } from "../workspaceHost";

export type RegisteredItemListView = {
  listKey: ItemListKey;
  topLevelItemIds: Array<string>;

  visibleItemIds: ReadonlySet<string>;

  filterActive: boolean;
};

const registeredListViewsByHost = new WeakMap<
  WorkspaceHost,
  Map<string, Map<ItemListKey, RegisteredItemListView>>
>();

function getRegisteredListViewsBySection(
  host: WorkspaceHost,
): Map<string, Map<ItemListKey, RegisteredItemListView>> {
  const existing = registeredListViewsByHost.get(host);
  if (existing) {
    return existing;
  }
  const views = new Map<string, Map<ItemListKey, RegisteredItemListView>>();
  registeredListViewsByHost.set(host, views);
  return views;
}

export function registerItemListView(
  host: WorkspaceHost,
  sectionId: string,
  view: RegisteredItemListView,
): void {
  assertNoReservedItemDndTokens(view.listKey, "item list key");
  const viewsBySection = getRegisteredListViewsBySection(host);
  const views = viewsBySection.get(sectionId) ?? new Map();
  if (views.has(view.listKey)) {
    throw new Error(
      `item list key "${view.listKey}" is already registered for section "${sectionId}"`,
    );
  }
  views.set(view.listKey, view);
  viewsBySection.set(sectionId, views);
}

export function isItemListViewRegistered(
  host: WorkspaceHost,
  sectionId: string,
  listKey: ItemListKey,
): boolean {
  return (
    getRegisteredListViewsBySection(host).get(sectionId)?.has(listKey) ?? false
  );
}

export function updateItemListView(
  host: WorkspaceHost,
  sectionId: string,
  view: RegisteredItemListView,
): void {
  const views = getRegisteredListViewsBySection(host).get(sectionId);
  if (!views?.has(view.listKey)) {
    throw new Error(
      `item list key "${view.listKey}" is not registered for section "${sectionId}"`,
    );
  }
  views.set(view.listKey, view);
}

export function unregisterItemListView(
  host: WorkspaceHost,
  sectionId: string,
  listKey: ItemListKey,
): void {
  const viewsBySection = getRegisteredListViewsBySection(host);
  const views = viewsBySection.get(sectionId);
  if (!views) {
    return;
  }
  views.delete(listKey);
  if (views.size === 0) {
    viewsBySection.delete(sectionId);
  }
}

export function resolveItemListView(
  host: WorkspaceHost,
  sectionId: string,
  activeItemId: string,
  listKey: ItemListKey | null,
): RegisteredItemListView | null {
  const views = getRegisteredListViewsBySection(host).get(sectionId);
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

type SectionItemVisibility = {
  visibleItemIds: Set<string>;
  filterActive: boolean;
};

export function getSectionItemVisibility(
  host: WorkspaceHost,
  sectionId: string,
): SectionItemVisibility | null {
  const views = getRegisteredListViewsBySection(host).get(sectionId);
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

export function resetItemListViews(host: WorkspaceHost): void {
  getRegisteredListViewsBySection(host).clear();
}
