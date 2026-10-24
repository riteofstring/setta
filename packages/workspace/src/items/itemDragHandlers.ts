import type { DragDropManager } from "@dnd-kit/dom";
import {
  getCollisionTriggerDistCondition,
  resolveOverCollisionId,
} from "../dnd/adapter/collisionCompare";
import { rectFromBoundingRect } from "../dnd/adapter/rect";
import type {
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from "../dnd/adapter/types";
import {
  addItemChild,
  getItemDndChildrenStore,
  getItemDndParentByChild,
  getItemDndParentId,
  replaceItemsWithTemp,
  resetItemDndChildren,
  updateItemChildren,
} from "../dnd/itemDndChildren";
import {
  getItemDndId,
  getItemIdFromDndId,
  getTempItemDndId,
  resetItemDndState,
  setItemDndState,
  getItemDndStateStore,
  type ItemListKey,
} from "../dnd/itemDndState";
import { getWorkspaceCapabilitiesStore } from "../document/capabilities";
import { getSectionItemTreeOrThrow } from "../document/documentSelectors";
import { selectOnlyItem } from "../document/itemSelection";
import { getItemSelectionModeStore } from "../document/itemSelectionMode";
import {
  buildItemParentMap,
  buildItemTreeView,
  getItemOrThrow,
  getRootSelectedItemIds,
  getSharedItemParentId,
  isDescendantOfItemSelection,
  resolveFullIndexForVisibleInsertion,
} from "../document/itemTree";
import { moveItems, orderItemIdsByParent } from "../document/moveItems";
import { getWorkspaceDocumentStore } from "../document/stores";
import {
  assertWorkspaceHostActive,
  registerWorkspaceHostCleanup,
} from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";
import {
  filterCollisionsForListKey,
  resolveItemPlaceholderMovePlan,
} from "./itemDndMonitorUtils";
import { resolveItemListView } from "./itemListRegistry";

type ItemDragData = {
  type?: string;
  sectionId?: string;
  listKey?: ItemListKey | null;
  itemId?: string | null;
};

type ItemStartDragData = {
  sectionId: string;
  listKey: ItemListKey | null;
  itemId: string | null;
};

type ItemDndStoreState = ReturnType<
  ReturnType<typeof getItemDndStateStore>["getState"]
>;
type ActiveItemDndState = ItemDndStoreState & {
  activeId: string;
  sectionId: string;
  listKey: ItemListKey;
};
type ItemDragAbort = { reason: string };
type ItemDragDropTarget = {
  tempId: string;
  newParentId: string;
  tempIndex: number;
};
type ItemDragOrdering = {
  oldParentId: string;
  orderedDraggingIds: Array<string>;
};
type ItemDragOverResolution = {
  overItemId: string;
  pastHalfway: boolean;
  triggerDistCondition: boolean;
};

type ItemDragOverInput = Pick<DragMoveEvent, "active" | "collisions" | "over">;
type ItemDragRuntime = {
  itemDragOverRaf: number | null;
  lastResolvedOverId: string | null;
  lastResolvedPastHalfway: boolean | null;
  lastResolvedTriggerDistCondition: boolean | null;
  pendingItemDragOver: ItemDragOverInput | null;
};

const runtimesByHost = new WeakMap<WorkspaceHost, ItemDragRuntime>();

function getItemDragRuntime(host: WorkspaceHost): ItemDragRuntime {
  assertWorkspaceHostActive(host);
  const existing = runtimesByHost.get(host);
  if (existing) {
    return existing;
  }
  const runtime: ItemDragRuntime = {
    itemDragOverRaf: null,
    lastResolvedOverId: null,
    lastResolvedPastHalfway: null,
    lastResolvedTriggerDistCondition: null,
    pendingItemDragOver: null,
  };
  runtimesByHost.set(host, runtime);
  registerWorkspaceHostCleanup(host, () => {
    if (runtime.itemDragOverRaf !== null) {
      cancelAnimationFrame(runtime.itemDragOverRaf);
    }
    runtimesByHost.delete(host);
  });
  return runtime;
}

export function handleItemDragStart(
  host: WorkspaceHost,
  event: DragStartEvent,
  manager: DragDropManager | null,
) {
  const dragData = getItemDragData(event);
  if (
    !dragData ||
    !canStartItemDrag(host, manager?.dragOperation.activatorEvent)
  ) {
    return;
  }
  const { sectionId } = dragData;

  const itemTree = getSectionItemTreeOrThrow(
    getWorkspaceDocumentStore(host).getState(),
    sectionId,
  );
  const activeId =
    dragData.itemId ?? getItemIdFromDndId(String(event.active.id));
  const parentById = buildItemParentMap(itemTree);
  if (!Object.prototype.hasOwnProperty.call(parentById, activeId)) {
    return;
  }

  const view = resolveItemListView(host, sectionId, activeId, dragData.listKey);
  if (!view || view.filterActive) {
    return;
  }

  const draggingIds = resolveDraggingItemIds(host, {
    sectionId,
    activeId,
    parentById,
    selectedItemIds: itemTree.selectedItemIds,
  });

  const tree = buildItemTreeView(
    itemTree,
    view.topLevelItemIds,
    view.visibleItemIds,
  );
  const activeDndId = getItemDndId(activeId, view.listKey);
  const draggingDndIds = draggingIds.map((itemId) =>
    getItemDndId(itemId, view.listKey),
  );
  const placeholderSize = measureItemDragSize(manager, draggingDndIds);
  const activeRect = measureItemActiveRect(
    manager,
    activeDndId,
    event.activeRect,
  );

  updateItemChildren(host, tree.visibleChildrenByParent);
  replaceItemsWithTemp(host, activeId, view.listKey, draggingIds);

  setItemDndState(host, {
    activeId,
    sectionId,
    listKey: view.listKey,
    rootId: tree.rootId,
    draggingIds,
    parentById,
    visibleChildrenByParent: tree.visibleChildrenByParent,
    activeRect,
    placeholderWidth: placeholderSize.width,
    placeholderHeight: placeholderSize.height,
  });
  resetItemDragOverState(host);
}

export function handleItemDragMove(host: WorkspaceHost, event: DragMoveEvent) {
  scheduleItemDragOver(host, event);
}

export function handleItemDragOver(host: WorkspaceHost, event: DragOverEvent) {
  scheduleItemDragOver(host, event);
}

export function handleItemDragEnd(host: WorkspaceHost) {
  const itemState = getItemDndStateStore(host).getState();
  if (!hasActiveItemDragState(itemState)) {
    deferItemDragReset(host);
    return;
  }

  const dropTarget = resolveItemDragDropTarget(host, itemState);
  if (isItemDragAbort(dropTarget)) {
    deferItemDragReset(host);
    return;
  }
  const itemTree = getSectionItemTreeOrThrow(
    getWorkspaceDocumentStore(host).getState(),
    itemState.sectionId,
  );
  const ordering = resolveItemDragOrdering(itemTree, itemState);
  if (isItemDragAbort(ordering)) {
    deferItemDragReset(host);
    return;
  }
  if (
    isDescendantOfItemSelection(
      itemState.parentById,
      dropTarget.newParentId,
      new Set(ordering.orderedDraggingIds),
    )
  ) {
    deferItemDragReset(host);
    return;
  }

  const newIndex = resolveItemDragInsertionIndex({
    itemTree,
    itemState,
    newParentId: dropTarget.newParentId,
    tempIndex: dropTarget.tempIndex,
    orderedDraggingIds: ordering.orderedDraggingIds,
  });
  if (
    newIndex === null ||
    isNoopItemDragMove({
      itemTree,
      newParentId: dropTarget.newParentId,
      oldParentId: ordering.oldParentId,
      orderedDraggingIds: ordering.orderedDraggingIds,
      newIndex,
    })
  ) {
    deferItemDragReset(host);
    return;
  }

  moveItems(host, {
    sectionId: itemState.sectionId,
    itemIds: ordering.orderedDraggingIds,
    newParentId: dropTarget.newParentId,
    newIndex,
  });
  deferItemDragReset(host);
}

export function handleItemDragCancel(host: WorkspaceHost) {
  deferItemDragReset(host);
}

function updateItemDragOver(
  host: WorkspaceHost,
  { active, collisions, over }: ItemDragOverInput,
) {
  if (!isItemDrag(active)) {
    return;
  }
  const itemState = getItemDndStateStore(host).getState();
  if (!hasActiveItemDragState(itemState) || !collisions) {
    return;
  }
  const filteredCollisions = filterCollisionsForListKey(
    collisions,
    itemState.listKey,
  );
  if (!filteredCollisions || filteredCollisions.length === 0) {
    return;
  }
  const resolution = resolveItemDragOverResolution(host, {
    filteredCollisions,
    over,
    listKey: itemState.listKey,
    sectionId: itemState.sectionId,
    rootId: itemState.rootId,
  });
  if (!resolution || !updateResolvedItemDragOverState(host, resolution)) {
    return;
  }

  const placeholderMove = resolveItemDragPlaceholderMove(host, {
    activeId: itemState.activeId,
    listKey: itemState.listKey,
    parentById: itemState.parentById,
    draggingIds: itemState.draggingIds,
    overId: resolution.overItemId,
    pastHalfway: resolution.pastHalfway,
    triggerDistCondition: resolution.triggerDistCondition,
  });
  if (!placeholderMove) {
    return;
  }
  maybeMoveItemPlaceholder(host, placeholderMove);
}

function hasActiveItemDragState(
  itemState: ItemDndStoreState,
): itemState is ActiveItemDndState {
  return Boolean(
    itemState.activeId && itemState.sectionId && itemState.listKey,
  );
}

function resolveDraggingItemIds(
  host: WorkspaceHost,
  {
    sectionId,
    activeId,
    parentById,
    selectedItemIds,
  }: {
    sectionId: string;
    activeId: string;
    parentById: Record<string, string | null>;
    selectedItemIds: Array<string>;
  },
) {
  if (!selectedItemIds.includes(activeId)) {
    selectOnlyItem(host, sectionId, activeId);
    return [activeId];
  }

  const rootSelected = getRootSelectedItemIds(parentById, selectedItemIds);
  const draggingIds = rootSelected.length > 0 ? rootSelected : [activeId];
  if (draggingIds.length === 1) {
    return draggingIds;
  }
  if (getSharedItemParentId(parentById, draggingIds)) {
    return draggingIds;
  }

  selectOnlyItem(host, sectionId, activeId);
  return [activeId];
}

function isItemDragAbort<T>(
  result: T | ItemDragAbort,
): result is ItemDragAbort {
  return typeof result === "object" && result !== null && "reason" in result;
}

function resolveItemDragDropTarget(
  host: WorkspaceHost,
  itemState: ActiveItemDndState,
): ItemDragDropTarget | ItemDragAbort {
  const tempId = getTempItemDndId(
    getItemDndId(itemState.activeId, itemState.listKey),
  );
  const dndChildrenState = getItemDndChildrenStore(host).getState();
  const newParentId = dndChildrenState.y[tempId] ?? null;
  if (!newParentId) {
    return { reason: "no-parent" };
  }
  const tempSiblings = dndChildrenState.x[newParentId] ?? [];
  const tempIndex = tempSiblings.indexOf(tempId);
  if (tempIndex < 0) {
    return { reason: "temp-not-found" };
  }
  return {
    tempId,
    newParentId,
    tempIndex,
  };
}

function resolveItemDragOrdering(
  itemTree: ReturnType<typeof getSectionItemTreeOrThrow>,
  itemState: ActiveItemDndState,
): ItemDragOrdering | ItemDragAbort {
  const oldParentId =
    getSharedItemParentId(itemState.parentById, itemState.draggingIds) ??
    itemState.parentById[itemState.draggingIds[0] ?? ""] ??
    null;
  if (!oldParentId) {
    return { reason: "no-old-parent" };
  }
  const orderedDraggingIds = orderItemIdsByParent(
    itemTree,
    oldParentId,
    itemState.draggingIds,
  );
  if (orderedDraggingIds.length === 0) {
    return { reason: "empty-ordered" };
  }
  return {
    oldParentId,
    orderedDraggingIds,
  };
}

function resolveItemDragInsertionIndex({
  itemTree,
  itemState,
  newParentId,
  tempIndex,
  orderedDraggingIds,
}: {
  itemTree: ReturnType<typeof getSectionItemTreeOrThrow>;
  itemState: ActiveItemDndState;
  newParentId: string;
  tempIndex: number;
  orderedDraggingIds: Array<string>;
}): number | null {
  const fullChildren = getItemOrThrow(itemTree, newParentId).children;
  const visibleSiblings = itemState.visibleChildrenByParent[newParentId] ?? [];
  return resolveFullIndexForVisibleInsertion({
    targetVisibleIndex: tempIndex,
    movingIds: new Set(orderedDraggingIds),
    visibleSiblings,
    fullChildren,
  });
}

function isNoopItemDragMove({
  itemTree,
  newParentId,
  oldParentId,
  orderedDraggingIds,
  newIndex,
}: {
  itemTree: ReturnType<typeof getSectionItemTreeOrThrow>;
  newParentId: string;
  oldParentId: string;
  orderedDraggingIds: Array<string>;
  newIndex: number;
}) {
  if (newParentId !== oldParentId) {
    return false;
  }
  const currentIndex = getItemOrThrow(itemTree, newParentId).children.indexOf(
    orderedDraggingIds[0] ?? "",
  );
  return currentIndex === newIndex;
}

function resolveItemDragOverResolution(
  host: WorkspaceHost,
  {
    filteredCollisions,
    over,
    listKey,
    sectionId,
    rootId,
  }: {
    filteredCollisions: NonNullable<DragOverEvent["collisions"]>;
    over: DragOverEvent["over"];
    listKey: ItemListKey;
    sectionId: string;
    rootId: string | null;
  },
): ItemDragOverResolution | null {
  const resolvedOverId = resolveOverCollisionId(
    filteredCollisions,
    getOverIdForListKey(over, listKey),
    getItemDndParentByChild(host, listKey),
  );
  const normalizedOverId = normalizeItemOverId(
    resolvedOverId ? String(resolvedOverId) : null,
    sectionId,
    rootId,
  );
  if (!normalizedOverId) {
    return null;
  }
  return {
    overItemId: getItemIdFromDndId(normalizedOverId),
    pastHalfway:
      getPastHalfwayFromCollisions(filteredCollisions, resolvedOverId) ?? false,
    triggerDistCondition:
      getCollisionTriggerDistCondition(resolvedOverId, filteredCollisions) ??
      false,
  };
}

function normalizeItemOverId(
  overId: string | null,
  sectionId: string,
  rootId: string | null,
) {
  if (!overId) {
    return null;
  }
  return overId === sectionId && rootId ? rootId : overId;
}

function updateResolvedItemDragOverState(
  host: WorkspaceHost,
  { overItemId, pastHalfway, triggerDistCondition }: ItemDragOverResolution,
) {
  const runtime = getItemDragRuntime(host);
  if (
    overItemId === runtime.lastResolvedOverId &&
    pastHalfway === runtime.lastResolvedPastHalfway &&
    triggerDistCondition === runtime.lastResolvedTriggerDistCondition
  ) {
    return false;
  }

  runtime.lastResolvedOverId = overItemId;
  runtime.lastResolvedPastHalfway = pastHalfway;
  runtime.lastResolvedTriggerDistCondition = triggerDistCondition;
  return true;
}

function resolveItemDragPlaceholderMove(
  host: WorkspaceHost,
  {
    activeId,
    listKey,
    parentById,
    draggingIds,
    overId,
    pastHalfway,
    triggerDistCondition,
  }: {
    activeId: string;
    listKey: ItemListKey;
    parentById: Record<string, string | null>;
    draggingIds: Array<string>;
    overId: string;
    pastHalfway: boolean;
    triggerDistCondition: boolean;
  },
) {
  const tempId = getTempItemDndId(getItemDndId(activeId, listKey));
  const newParentId = resolveItemDragParent(host, {
    overId,
    parentById,
    draggingIds,
    triggerDistCondition,
  });
  if (!newParentId) {
    return null;
  }
  return {
    tempId,
    overId,
    oldParentId: getItemDndParentId(host, tempId) ?? null,
    newParentId,
    pastHalfway,
  };
}

function resolveItemDragParent(
  host: WorkspaceHost,
  {
    overId,
    parentById,
    draggingIds,
    triggerDistCondition,
  }: {
    overId: string;
    parentById: Record<string, string | null>;
    draggingIds: Array<string>;
    triggerDistCondition: boolean;
  },
) {
  if (!Object.prototype.hasOwnProperty.call(parentById, overId)) {
    return null;
  }
  if (isDescendantOfItemSelection(parentById, overId, new Set(draggingIds))) {
    return null;
  }
  if (triggerDistCondition) {
    return overId;
  }
  return getItemDndParentId(host, overId) ?? overId;
}

function maybeMoveItemPlaceholder(
  host: WorkspaceHost,
  {
    tempId,
    overId,
    oldParentId,
    newParentId,
    pastHalfway,
  }: {
    tempId: string;
    overId: string;
    oldParentId: string | null;
    newParentId: string;
    pastHalfway: boolean;
  },
) {
  const dndChildrenState = getItemDndChildrenStore(host).getState();
  const movePlan = resolveItemPlaceholderMovePlan({
    tempId,
    overId,
    oldParentId,
    newParentId,
    pastHalfway,
    newParentChildren: dndChildrenState.x[newParentId] ?? [],
  });
  if (!movePlan) {
    return;
  }

  addItemChild(host, oldParentId, newParentId, tempId, movePlan.index);
}

function getItemDragData(event: DragStartEvent): ItemStartDragData | null {
  const data = event.active.data?.current as ItemDragData | undefined;
  if (!data || data.type !== "item" || !data.sectionId) {
    return null;
  }
  return {
    sectionId: data.sectionId,
    listKey: data.listKey ?? null,
    itemId: data.itemId ?? null,
  };
}

function isItemDrag(active: DragStartEvent["active"]) {
  return (active.data?.current as ItemDragData | undefined)?.type === "item";
}

function getOverIdForListKey(
  over: DragOverEvent["over"] | null,
  listKey: ItemListKey | null,
) {
  if (!over) {
    return null;
  }
  if (!listKey) {
    return over.id;
  }
  const data = over.data as
    { current?: { listKey?: ItemListKey | null } } | undefined;
  if (data?.current?.listKey !== listKey) {
    return null;
  }
  return over.id;
}

function canStartItemDrag(host: WorkspaceHost, event?: Event | null) {
  const target = event?.target;
  const fromHandle =
    target instanceof Element &&
    target.closest('[data-workspace-item-drag-handle="true"]');
  if (
    !fromHandle &&
    !getItemSelectionModeStore(host).getState().isSelectingItems
  ) {
    return false;
  }
  return getWorkspaceCapabilitiesStore(host).getState().canEditStructure;
}

export function resetItemDragState(host: WorkspaceHost) {
  resetScheduledItemDragOver(host);
  resetItemDndChildren(host);
  resetItemDndState(host);
  resetItemDragOverState(host);
}

export function deferItemDragReset(host: WorkspaceHost) {
  resetScheduledItemDragOver(host);
  resetItemDragOverState(host);
  setItemDndState(host, { pendingReset: true });
}

function resetItemDragOverState(host: WorkspaceHost) {
  const runtime = getItemDragRuntime(host);
  runtime.lastResolvedOverId = null;
  runtime.lastResolvedPastHalfway = null;
  runtime.lastResolvedTriggerDistCondition = null;
}

function scheduleItemDragOver(host: WorkspaceHost, event: ItemDragOverInput) {
  const runtime = getItemDragRuntime(host);
  runtime.pendingItemDragOver = {
    active: event.active,
    collisions: event.collisions,
    over: event.over,
  };
  if (runtime.itemDragOverRaf !== null) {
    return;
  }
  runtime.itemDragOverRaf = requestAnimationFrame(() => {
    runtime.itemDragOverRaf = null;
    const nextEvent = runtime.pendingItemDragOver;
    runtime.pendingItemDragOver = null;
    if (nextEvent) {
      updateItemDragOver(host, nextEvent);
    }
  });
}

function resetScheduledItemDragOver(host: WorkspaceHost) {
  const runtime = getItemDragRuntime(host);
  if (runtime.itemDragOverRaf !== null) {
    cancelAnimationFrame(runtime.itemDragOverRaf);
    runtime.itemDragOverRaf = null;
  }
  runtime.pendingItemDragOver = null;
}

function getPastHalfwayFromCollisions(
  collisions: DragOverEvent["collisions"] | null,
  overId: string | number | null,
): boolean | null {
  if (!collisions || collisions.length === 0 || !overId) {
    return null;
  }

  const match = collisions.find(
    (collision) => String(collision.id) === String(overId),
  );
  if (!match || match.pastHalfway === undefined) {
    return null;
  }

  return Boolean(match.pastHalfway);
}

function measureItemDragSize(
  manager: DragDropManager | null,
  dndIds: Array<string>,
) {
  let width = 0;
  let height = 0;
  for (const dndId of dndIds) {
    const rect = getDroppableRect(manager, dndId);
    if (!rect) {
      continue;
    }
    width = Math.max(width, rect.width);
    height += rect.height;
  }
  if (width === 0) {
    width = 220;
  }
  if (height === 0) {
    height = 32;
  }
  return { width, height };
}

function measureItemActiveRect(
  manager: DragDropManager | null,
  dndId: string,
  fallbackRect: DragStartEvent["activeRect"] | null,
) {
  return getDroppableRect(manager, dndId) ?? fallbackRect ?? null;
}

function getDroppableRect(
  manager: DragDropManager | null,
  droppableId: string,
) {
  const shape = manager?.registry.droppables.get(droppableId)?.shape;
  if (!shape) {
    return null;
  }
  return rectFromBoundingRect(shape.boundingRectangle);
}
