import type { DragDropManager } from "@dnd-kit/dom";
import { resolveOverCollisionId } from "../dnd/adapter/collisionCompare";
import { rectFromBoundingRect } from "../dnd/adapter/rect";
import type { DragMoveEvent, DragOverEvent, DragStartEvent } from "../dnd/adapter/types";
import {
  addItemChild,
  getItemDndParentByChild,
  getItemDndParentId,
  replaceItemsWithTemp,
  resetItemDndChildren,
  updateItemChildren,
  useItemDndChildren,
} from "../dnd/itemDndChildren";
import {
  getItemDndId,
  getItemIdFromDndId,
  getTempItemDndId,
  resetItemDndState,
  setItemDndState,
  useItemDndState,
  type ItemListKey,
} from "../dnd/itemDndState";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { getSectionItemTreeOrThrow } from "../document/documentSelectors";
import { selectOnlyItem } from "../document/itemSelection";
import { useItemSelectionMode } from "../document/itemSelectionMode";
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
import { useWorkspaceDocument } from "../document/stores";
import { filterCollisionsForListKey, resolveItemPlaceholderMovePlan } from "./itemDndMonitorUtils";
import { resolveItemListView } from "./itemListRegistry";

// The reference's `ParamDndMonitor` drag lifecycle in item terms, minus the app-only branches:
// the backend move route is the package `moveItems` funnel, the multi-parent-selection and
// active-filter toasts stay application-side (the fallbacks they narrate are unchanged), and
// the deployment-mode guard is the `canEditStructure` capability. The reference's no-op debug
// channel is dropped.

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

type ItemDndStoreState = ReturnType<typeof useItemDndState.getState>;
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

let lastResolvedOverId: string | null = null;
let lastResolvedPastHalfway: boolean | null = null;
let lastResolvedTriggerDistCondition: boolean | null = null;
type ItemDragOverInput = Pick<DragMoveEvent, "active" | "collisions" | "over">;
let pendingItemDragOver: ItemDragOverInput | null = null;
let itemDragOverRaf: number | null = null;

export function handleItemDragStart(event: DragStartEvent, manager: DragDropManager | null) {
  const dragData = getItemDragData(event);
  if (!dragData || !canStartItemDrag()) {
    return;
  }
  const { sectionId } = dragData;

  const itemTree = getSectionItemTreeOrThrow(useWorkspaceDocument.getState(), sectionId);
  const activeId = dragData.itemId ?? getItemIdFromDndId(String(event.active.id));
  const parentById = buildItemParentMap(itemTree);
  if (!Object.prototype.hasOwnProperty.call(parentById, activeId)) {
    return;
  }

  const draggingIds = resolveDraggingItemIds({
    sectionId,
    activeId,
    parentById,
    selectedItemIds: itemTree.selectedItemIds,
  });

  const view = resolveItemListView(sectionId, activeId, dragData.listKey);
  if (!view || view.filterActive) {
    return;
  }

  const tree = buildItemTreeView(itemTree, view.topLevelItemIds, view.visibleItemIds);
  const activeDndId = getItemDndId(activeId, view.listKey);
  const draggingDndIds = draggingIds.map((itemId) => getItemDndId(itemId, view.listKey));
  const placeholderSize = measureItemDragSize(manager, draggingDndIds);
  const activeRect = measureItemActiveRect(manager, activeDndId, event.activeRect);

  updateItemChildren(tree.visibleChildrenByParent);
  replaceItemsWithTemp(activeId, view.listKey, draggingIds);

  setItemDndState({
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
  resetItemDragOverState();
}

export function handleItemDragMove(event: DragMoveEvent) {
  scheduleItemDragOver(event);
}

export function handleItemDragOver(event: DragOverEvent) {
  scheduleItemDragOver(event);
}

export function handleItemDragEnd() {
  const itemState = useItemDndState.getState();
  if (!hasActiveItemDragState(itemState)) {
    deferItemDragReset();
    return;
  }

  const dropTarget = resolveItemDragDropTarget(itemState);
  if (isItemDragAbort(dropTarget)) {
    deferItemDragReset();
    return;
  }
  const itemTree = getSectionItemTreeOrThrow(useWorkspaceDocument.getState(), itemState.sectionId);
  const ordering = resolveItemDragOrdering(itemTree, itemState);
  if (isItemDragAbort(ordering)) {
    deferItemDragReset();
    return;
  }
  if (
    isDescendantOfItemSelection(
      itemState.parentById,
      dropTarget.newParentId,
      new Set(ordering.orderedDraggingIds),
    )
  ) {
    deferItemDragReset();
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
    deferItemDragReset();
    return;
  }

  moveItems({
    sectionId: itemState.sectionId,
    itemIds: ordering.orderedDraggingIds,
    newParentId: dropTarget.newParentId,
    newIndex,
  });
  deferItemDragReset();
}

export function handleItemDragCancel() {
  deferItemDragReset();
}

function updateItemDragOver({ active, collisions, over }: ItemDragOverInput) {
  if (!isItemDrag(active)) {
    return;
  }
  const itemState = useItemDndState.getState();
  if (!hasActiveItemDragState(itemState) || !collisions) {
    return;
  }
  const filteredCollisions = filterCollisionsForListKey(collisions, itemState.listKey);
  if (!filteredCollisions || filteredCollisions.length === 0) {
    return;
  }
  const resolution = resolveItemDragOverResolution({
    filteredCollisions,
    over,
    listKey: itemState.listKey,
    sectionId: itemState.sectionId,
    rootId: itemState.rootId,
  });
  if (!resolution || !updateResolvedItemDragOverState(resolution)) {
    return;
  }

  const placeholderMove = resolveItemDragPlaceholderMove({
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
  maybeMoveItemPlaceholder(placeholderMove);
}

function hasActiveItemDragState(itemState: ItemDndStoreState): itemState is ActiveItemDndState {
  return Boolean(itemState.activeId && itemState.sectionId && itemState.listKey);
}

function resolveDraggingItemIds({
  sectionId,
  activeId,
  parentById,
  selectedItemIds,
}: {
  sectionId: string;
  activeId: string;
  parentById: Record<string, string | null>;
  selectedItemIds: Array<string>;
}) {
  if (!selectedItemIds.includes(activeId)) {
    selectOnlyItem(sectionId, activeId);
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

  // The reference's multi-parent-selection toast stays application-side; the drag-only-the-
  // active-item fallback is unchanged.
  selectOnlyItem(sectionId, activeId);
  return [activeId];
}

function isItemDragAbort<T>(result: T | ItemDragAbort): result is ItemDragAbort {
  return typeof result === "object" && result !== null && "reason" in result;
}

function resolveItemDragDropTarget(
  itemState: ActiveItemDndState,
): ItemDragDropTarget | ItemDragAbort {
  const tempId = getTempItemDndId(getItemDndId(itemState.activeId, itemState.listKey));
  const dndChildrenState = useItemDndChildren.getState();
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
  const orderedDraggingIds = orderItemIdsByParent(itemTree, oldParentId, itemState.draggingIds);
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

function resolveItemDragOverResolution({
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
}): ItemDragOverResolution | null {
  const resolvedOverId = resolveOverCollisionId(
    filteredCollisions,
    getOverIdForListKey(over, listKey),
    getItemDndParentByChild(listKey),
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
    pastHalfway: getPastHalfwayFromCollisions(filteredCollisions, resolvedOverId) ?? false,
    triggerDistCondition:
      getCollisionTriggerDistCondition(resolvedOverId, filteredCollisions) ?? false,
  };
}

function normalizeItemOverId(overId: string | null, sectionId: string, rootId: string | null) {
  if (!overId) {
    return null;
  }
  return overId === sectionId && rootId ? rootId : overId;
}

function updateResolvedItemDragOverState({
  overItemId,
  pastHalfway,
  triggerDistCondition,
}: ItemDragOverResolution) {
  if (
    overItemId === lastResolvedOverId &&
    pastHalfway === lastResolvedPastHalfway &&
    triggerDistCondition === lastResolvedTriggerDistCondition
  ) {
    return false;
  }

  lastResolvedOverId = overItemId;
  lastResolvedPastHalfway = pastHalfway;
  lastResolvedTriggerDistCondition = triggerDistCondition;
  return true;
}

function resolveItemDragPlaceholderMove({
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
}) {
  const tempId = getTempItemDndId(getItemDndId(activeId, listKey));
  const newParentId = resolveItemDragParent({
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
    oldParentId: getItemDndParentId(tempId) ?? null,
    newParentId,
    pastHalfway,
  };
}

function resolveItemDragParent({
  overId,
  parentById,
  draggingIds,
  triggerDistCondition,
}: {
  overId: string;
  parentById: Record<string, string | null>;
  draggingIds: Array<string>;
  triggerDistCondition: boolean;
}) {
  if (!Object.prototype.hasOwnProperty.call(parentById, overId)) {
    return null;
  }
  if (isDescendantOfItemSelection(parentById, overId, new Set(draggingIds))) {
    return null;
  }
  if (triggerDistCondition) {
    return overId;
  }
  return getItemDndParentId(overId) ?? overId;
}

function maybeMoveItemPlaceholder({
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
}) {
  const dndChildrenState = useItemDndChildren.getState();
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

  addItemChild(oldParentId, newParentId, tempId, movePlan.index);
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

function getOverIdForListKey(over: DragOverEvent["over"] | null, listKey: ItemListKey | null) {
  if (!over) {
    return null;
  }
  if (!listKey) {
    return over.id;
  }
  const data = over.data as { current?: { listKey?: ItemListKey | null } } | undefined;
  if (data?.current?.listKey !== listKey) {
    return null;
  }
  return over.id;
}

function canStartItemDrag() {
  if (!useItemSelectionMode.getState().isSelectingItems) {
    return false;
  }
  return useWorkspaceCapabilities.getState().canEditStructure;
}

export function resetItemDragState() {
  resetScheduledItemDragOver();
  resetItemDndChildren();
  resetItemDndState();
  resetItemDragOverState();
}

export function deferItemDragReset() {
  resetScheduledItemDragOver();
  resetItemDragOverState();
  setItemDndState({ pendingReset: true });
}

function resetItemDragOverState() {
  lastResolvedOverId = null;
  lastResolvedPastHalfway = null;
  lastResolvedTriggerDistCondition = null;
}

function scheduleItemDragOver(event: ItemDragOverInput) {
  pendingItemDragOver = {
    active: event.active,
    collisions: event.collisions,
    over: event.over,
  };
  if (itemDragOverRaf !== null) {
    return;
  }
  itemDragOverRaf = requestAnimationFrame(() => {
    itemDragOverRaf = null;
    const nextEvent = pendingItemDragOver;
    pendingItemDragOver = null;
    if (nextEvent) {
      updateItemDragOver(nextEvent);
    }
  });
}

function resetScheduledItemDragOver() {
  if (itemDragOverRaf !== null) {
    cancelAnimationFrame(itemDragOverRaf);
    itemDragOverRaf = null;
  }
  pendingItemDragOver = null;
}

function getCollisionTriggerDistCondition(
  overId: string | number | null,
  collisions: DragOverEvent["collisions"] | null,
): boolean | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  if (overId !== null) {
    const matching = collisions.find((collision) => String(collision.id) === String(overId));
    if (matching && matching.triggerDistCondition !== undefined) {
      return Boolean(matching.triggerDistCondition);
    }
  }

  const fallback = collisions[0]?.triggerDistCondition;
  if (fallback === undefined) {
    return null;
  }

  return Boolean(fallback);
}

function getPastHalfwayFromCollisions(
  collisions: DragOverEvent["collisions"] | null,
  overId: string | number | null,
): boolean | null {
  if (!collisions || collisions.length === 0 || !overId) {
    return null;
  }

  const match = collisions.find((collision) => String(collision.id) === String(overId));
  if (!match || match.pastHalfway === undefined) {
    return null;
  }

  return Boolean(match.pastHalfway);
}

function measureItemDragSize(manager: DragDropManager | null, dndIds: Array<string>) {
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

function getDroppableRect(manager: DragDropManager | null, droppableId: string) {
  const shape = manager?.registry.droppables.get(droppableId)?.shape;
  if (!shape) {
    return null;
  }
  return rectFromBoundingRect(shape.boundingRectangle);
}
