import type { DragDropManager } from "@dnd-kit/dom";
import { DragOverlay, useDragDropManager } from "@dnd-kit/react";
import { useComputed } from "@dnd-kit/react/hooks";
import type {
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from "forks/dnd-kit/adapter";
import { computeNewIndex, useDndMonitor } from "forks/dnd-kit/adapter";
import { rectFromBoundingRect } from "forks/dnd-kit/adapter/rect";
import { resolveOverCollisionId } from "forks/dnd-kit/adapter/collisionCompare";
import {
  addParamChild,
  getParamDndParentId,
  removeParamChild,
  replaceParamsWithTemp,
  resetParamDndChildren,
  updateParamChildren,
  useParamDndChildren,
} from "forks/dnd-kit/paramDndChildren";
import {
  getParamDndId,
  resetParamDndState,
  setParamDndState,
  useParamDndState,
  type ParamListKey,
} from "forks/dnd-kit/paramDndState";
import _ from "lodash";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  moveParamsWithBackend,
  orderParamIdsByParent,
  selectOnlyParam,
} from "state/actions/params/moveParams";
import {
  buildParamParentMap,
  buildParamTreeView,
  getParamRootId,
  getRootSelectedParamIds,
  getSharedParentId,
  isDescendantOfSelection,
  resolveFullIndexForVisibleInsertion,
} from "state/actions/params/paramTree";
import {
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrShownParamIds,
} from "state/actions/sectionInfos";
import {
  useMisc,
  useProjectState,
  useShareSession,
  type ZustandProjectState,
} from "state/definitions";
import {
  isBaseParentCodeObjImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";

type ParamDragData = {
  type?: string;
  sectionId?: string;
  listKey?: ParamListKey | null;
};

type ParamListView = {
  listKey: ParamListKey;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  topLevelParamIds: Array<string>;
};

type CollisionSortableData = {
  containerId?: string | number;
  index?: number;
};

type CollisionDroppableData = {
  current?: {
    listKey?: ParamListKey | null;
    type?: string;
    sectionId?: string;
    isTopLevel?: boolean;
    hasNested?: boolean;
    onlyChildId?: string | null;
    sortable?: CollisionSortableData;
  };
};

let lastResolvedOverId: string | null = null;
let lastResolvedPastHalfway: boolean | null = null;
let lastResolvedTriggerDistCondition: boolean | null = null;
let lastFilteredCollisionEmpty: boolean | null = null;

export function ParamDndMonitor() {
  const manager = useDragDropManager();
  useDndMonitor({
    onDragStart: (event) => handleParamDragStart(event, manager),
    onDragMove: handleParamDragMove,
    onDragOver: handleParamDragOver,
    onDragEnd: handleParamDragEnd,
    onDragCancel: handleParamDragCancel,
  });

  return null;
}

export function ParamDragOverlay() {
  const manager = useDragDropManager();
  const activeDragType = useComputed(() => {
    const sourceData = manager?.dragOperation.source?.data as
      | { current?: { type?: string } }
      | undefined;
    return sourceData?.current?.type ?? null;
  }, [manager]).value;
  const isParamDrag = activeDragType === "param";
  const { activeId, placeholderWidth, placeholderHeight, dragOffset } =
    useParamDndState(
      (state) => ({
        activeId: state.activeId,
        placeholderWidth: state.placeholderWidth,
        placeholderHeight: state.placeholderHeight,
        dragOffset: state.dragOffset,
      }),
      _.isEqual,
    );
  const isDragging = useComputed(
    () => manager?.dragOperation.status.dragging ?? false,
    [manager],
  ).value;
  const isInitializing = useComputed(
    () => manager?.dragOperation.status.initializing ?? false,
    [manager],
  ).value;
  const shouldRenderOverlay = useComputed(
    () => manager?.dragOperation.status.initialized ?? false,
    [manager],
  ).value;
  const overlayMetricsRef = useRef<{
    width: number;
    height: number;
    dragOffset: { x: number; y: number } | null;
  } | null>(null);
  const overlayMetrics = activeId
    ? {
        width: placeholderWidth ?? 220,
        height: placeholderHeight ?? 32,
        dragOffset,
      }
    : overlayMetricsRef.current;

  useEffect(() => {
    if (activeId && overlayMetrics) {
      overlayMetricsRef.current = overlayMetrics;
      return;
    }
    if (!activeId && !isParamDrag) {
      overlayMetricsRef.current = null;
    }
  }, [activeId, isParamDrag, overlayMetrics]);

  const overlayStyle =
    isDragging || isInitializing ? undefined : { opacity: 0 };

  if (!shouldRenderOverlay || !isParamDrag || !overlayMetrics) {
    return null;
  }

  const offsetStyle = overlayMetrics.dragOffset
    ? {
        transform: `translate(${-overlayMetrics.dragOffset.x}px, ${-overlayMetrics.dragOffset.y}px)`,
      }
    : undefined;

  return createPortal(
    <DragOverlay style={overlayStyle}>
      <div
        className="rounded-sm bg-blue-600/80 shadow-md dark:bg-blue-700/70"
        style={{
          width: overlayMetrics.width,
          height: overlayMetrics.height,
          ...(offsetStyle ?? {}),
        }}
      />
    </DragOverlay>,
    document.body,
  );
}

function handleParamDragStart(
  event: DragStartEvent,
  manager: DragDropManager | null,
) {
  const dragData = getParamDragData(event);
  if (!dragData) {
    return;
  }
  const { sectionId } = dragData;
  if (!canStartParamDrag(sectionId)) {
    return;
  }

  const state = useProjectState.getState();
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const activeId = String(event.active.id);
  const rootId = getParamRootId(state, sectionId);
  const parentById = buildParamParentMap(state, sectionId, rootId);
  if (!Object.prototype.hasOwnProperty.call(parentById, activeId)) {
    return;
  }

  const selectedParams = sectionImpl.selectedParams ?? [];
  const rootSelected = getRootSelectedParamIds(parentById, selectedParams);
  const isActiveSelected = selectedParams.includes(activeId);
  let draggingIds = isActiveSelected ? rootSelected : [activeId];

  if (!isActiveSelected) {
    selectOnlyParam(sectionId, activeId);
  }

  const sharedParent = getSharedParentId(parentById, draggingIds);
  if (!sharedParent && draggingIds.length > 1) {
    addTemporaryNotification("Param selection spans multiple parents.");
    draggingIds = [activeId];
    selectOnlyParam(sectionId, activeId);
  }

  const view = resolveParamListView(
    state,
    sectionId,
    activeId,
    dragData.listKey,
  );
  if (!view) {
    return;
  }

  const tree = buildParamTreeView(
    state,
    sectionId,
    view.topLevelParamIds,
    view.requiredParamIdsToPaths,
  );
  const placeholderSize = measureParamDragSize(manager, draggingIds);
  const activeRect = measureParamActiveRect(manager, activeId, event.activeRect);
  const dragOffset = resolveParamDragOffset(activeRect);
  updateParamChildren(tree.visibleChildrenByParent);
  replaceParamsWithTemp(activeId, draggingIds);

  setParamDndState({
    activeId,
    sectionId,
    listKey: view.listKey,
    rootId: tree.rootId,
    draggingIds,
    parentById,
    visibleChildrenByParent: tree.visibleChildrenByParent,
    activeRect,
    dragOffset,
    placeholderWidth: placeholderSize.width,
    placeholderHeight: placeholderSize.height,
  });
  resetParamDragOverState();
}

function handleParamDragMove(event: DragMoveEvent) {
  updateParamDragOver(event);
}

function handleParamDragOver(event: DragOverEvent) {
  updateParamDragOver(event);
}

function handleParamDragEnd() {
  const paramState = useParamDndState.getState();
  if (!paramState.activeId || !paramState.sectionId) {
    resetParamDragState();
    return;
  }

  const tempId = getParamDndId(paramState.activeId);
  const dndChildrenState = useParamDndChildren.getState();
  const newParentId = dndChildrenState.y[tempId] ?? null;
  if (!newParentId) {
    resetParamDragState();
    return;
  }

  const tempSiblings = dndChildrenState.x[newParentId] ?? [];
  const tempIndex = tempSiblings.indexOf(tempId);
  if (tempIndex < 0) {
    resetParamDragState();
    return;
  }

  const state = useProjectState.getState();
  const oldParentId =
    getSharedParentId(paramState.parentById, paramState.draggingIds) ??
    paramState.parentById[paramState.draggingIds[0]] ??
    null;
  if (!oldParentId) {
    resetParamDragState();
    return;
  }
  const orderedDraggingIds = orderParamIdsByParent(
    state,
    paramState.sectionId,
    oldParentId,
    paramState.draggingIds,
  );
  if (orderedDraggingIds.length === 0) {
    resetParamDragState();
    return;
  }
  if (
    isDescendantOfSelection(
      paramState.parentById,
      newParentId,
      new Set(orderedDraggingIds),
    )
  ) {
    resetParamDragState();
    return;
  }

  const newParentImpl = getCurrEffectiveCodeObjImpl(
    state,
    paramState.sectionId,
    newParentId,
  );
  const fullChildren = isBaseParentCodeObjImpl(newParentImpl)
    ? newParentImpl.children
    : [];
  const visibleSiblings = paramState.visibleChildrenByParent[newParentId] ?? [];
  const newIndex = resolveFullIndexForVisibleInsertion({
    targetVisibleIndex: tempIndex,
    movingIds: new Set(orderedDraggingIds),
    visibleSiblings,
    fullChildren,
  });
  if (newIndex === null) {
    resetParamDragState();
    return;
  }

  if (newParentId === oldParentId && isBaseParentCodeObjImpl(newParentImpl)) {
    const currentIndex = newParentImpl.children.indexOf(orderedDraggingIds[0]);
    if (currentIndex === newIndex) {
      resetParamDragState();
      return;
    }
  }

  moveParamsWithBackend({
    sectionId: paramState.sectionId,
    paramIds: orderedDraggingIds,
    newParentId,
    newIndex,
  });
  resetParamDragState();
}

function handleParamDragCancel() {
  resetParamDragState();
}

function updateParamDragOver({
  active,
  collisions,
  over,
}: DragOverEvent | DragMoveEvent) {
  if (!isParamDrag(active)) {
    return;
  }
  const paramState = useParamDndState.getState();
  if (!paramState.activeId || !paramState.sectionId || !collisions) {
    return;
  }
  const filteredCollisions = filterCollisionsForListKey(
    collisions,
    paramState.listKey,
  );
  if (!filteredCollisions || filteredCollisions.length === 0) {
    if (
      collisions &&
      collisions.length > 0 &&
      lastFilteredCollisionEmpty !== true
    ) {
      lastFilteredCollisionEmpty = true;
    }
    if (!collisions || collisions.length === 0) {
      if (
        lastResolvedOverId === null &&
        lastResolvedPastHalfway === null &&
        lastResolvedTriggerDistCondition === null
      ) {
        return;
      }
      lastResolvedOverId = null;
      lastResolvedPastHalfway = null;
      lastResolvedTriggerDistCondition = null;
      removeParamChild(getParamDndId(paramState.activeId));
    }
    return;
  }
  if (lastFilteredCollisionEmpty) {
    lastFilteredCollisionEmpty = false;
  }
  const resolvedOverId = resolveOverCollisionId(
    filteredCollisions,
    getOverIdForListKey(over, paramState.listKey),
    useParamDndChildren.getState().y,
  );
  const overId = resolvedOverId ? String(resolvedOverId) : null;
  if (!overId) {
    return;
  }
  const pastHalfway = getPastHalfwayFromCollisions(
    filteredCollisions,
    resolvedOverId,
  );
  const triggerDistCondition =
    getCollisionTriggerDistCondition(resolvedOverId, filteredCollisions) ??
    false;
  const normalizedOverId =
    overId === paramState.sectionId && paramState.rootId
      ? paramState.rootId
      : overId;

  if (
    normalizedOverId === lastResolvedOverId &&
    pastHalfway === lastResolvedPastHalfway &&
    triggerDistCondition === lastResolvedTriggerDistCondition
  ) {
    return;
  }

  lastResolvedOverId = normalizedOverId;
  lastResolvedPastHalfway = pastHalfway;
  lastResolvedTriggerDistCondition = triggerDistCondition;

  const oldParentId =
    getParamDndParentId(getParamDndId(paramState.activeId)) ?? null;

  const newParentId = resolveParamDragParent({
    overId: normalizedOverId,
    parentById: paramState.parentById,
    draggingIds: paramState.draggingIds,
    triggerDistCondition,
  });
  if (!newParentId) {
    return;
  }
  maybeMovePlaceholder({
    tempId: getParamDndId(paramState.activeId),
    overId: normalizedOverId,
    oldParentId,
    newParentId,
    pastHalfway: pastHalfway ?? false,
  });
}

function resolveParamDragParent({
  overId,
  parentById,
  draggingIds,
  triggerDistCondition,
}: {
  overId: string;
  parentById: Record<string, string | null>;
  draggingIds: string[];
  triggerDistCondition: boolean;
}) {
  if (!Object.prototype.hasOwnProperty.call(parentById, overId)) {
    return null;
  }
  if (isDescendantOfSelection(parentById, overId, new Set(draggingIds))) {
    return null;
  }
  if (triggerDistCondition) {
    return overId;
  }
  return getParamDndParentId(overId) ?? overId;
}

function maybeMovePlaceholder({
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
  const dndChildrenState = useParamDndChildren.getState();
  const newParentChildren = dndChildrenState.x[newParentId] ?? [];
  const overIndex = newParentChildren.indexOf(overId);
  const tempInNewParent = newParentChildren.includes(tempId);

  if (newParentId !== oldParentId) {
    let index = 0;
    if (overIndex >= 0) {
      index = pastHalfway ? overIndex + 1 : overIndex;
    } else if (
      overId === newParentId &&
      newParentChildren.length > 0 &&
      !tempInNewParent
    ) {
      index = pastHalfway ? newParentChildren.length : 0;
    } else {
      index = newParentChildren.length;
    }
    addParamChild(oldParentId, newParentId, tempId, index);
    return;
  }

  const activeIndex = newParentChildren.indexOf(tempId);
  if (activeIndex >= 0 && overIndex >= 0 && overId !== tempId) {
    const nextIndex = computeNewIndex(
      activeIndex,
      overIndex,
      pastHalfway,
      newParentChildren.length,
    );
    if (nextIndex !== activeIndex) {
      addParamChild(oldParentId, newParentId, tempId, nextIndex);
    }
  }
}

function getParamDragData(event: DragStartEvent): {
  sectionId: string;
  listKey: ParamListKey | null;
} | null {
  const data = event.active.data?.current as ParamDragData | undefined;
  if (!data || data.type !== "param" || !data.sectionId) {
    return null;
  }
  return {
    sectionId: data.sectionId,
    listKey: data.listKey ?? null,
  };
}

function isParamDrag(active: DragStartEvent["active"]) {
  return (active.data?.current as ParamDragData | undefined)?.type === "param";
}

function filterCollisionsForListKey(
  collisions: DragOverEvent["collisions"] | null,
  listKey: ParamListKey | null,
) {
  if (!collisions || !listKey) {
    return collisions;
  }
  return collisions.filter((collision) => {
    const data = collision.data?.droppable?.data as
      | CollisionDroppableData
      | undefined;
    return data?.current?.listKey === listKey;
  });
}

function getOverIdForListKey(
  over: DragOverEvent["over"] | null,
  listKey: ParamListKey | null,
) {
  if (!over) {
    return null;
  }
  if (!listKey) {
    return over.id;
  }
  const data = over.data as CollisionDroppableData | undefined;
  if (data?.current?.listKey !== listKey) {
    return null;
  }
  return over.id;
}

function canStartParamDrag(sectionId: string) {
  if (!useMisc.getState().isSelectingParams) {
    return false;
  }
  const shareSession = useShareSession.getState();
  if (shareSession.isShareMode) {
    return false;
  }
  const state = useProjectState.getState();
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  if (sectionImpl.paramFilter.trim().length > 0) {
    addTemporaryNotification("Param move disabled while filter is active.");
    return false;
  }
  return true;
}

function resolveParamListView(
  state: ZustandProjectState,
  sectionId: string,
  activeId: string,
  listKey: ParamListKey | null,
): ParamListView | null {
  if (listKey) {
    const view = getParamListView(state, sectionId, listKey);
    if (
      view &&
      Object.prototype.hasOwnProperty.call(
        view.requiredParamIdsToPaths,
        activeId,
      )
    ) {
      return view;
    }
  }
  const pinned = getParamListView(state, sectionId, "pinned");
  if (
    pinned &&
    Object.prototype.hasOwnProperty.call(
      pinned.requiredParamIdsToPaths,
      activeId,
    )
  ) {
    return pinned;
  }
  const unpinned = getParamListView(state, sectionId, "unpinned");
  if (
    unpinned &&
    Object.prototype.hasOwnProperty.call(
      unpinned.requiredParamIdsToPaths,
      activeId,
    )
  ) {
    return unpinned;
  }
  return null;
}

function getParamListView(
  state: ZustandProjectState,
  sectionId: string,
  listKey: ParamListKey,
): ParamListView {
  const { requiredParamIdsToPaths, topLevelParamIds } = getCurrShownParamIds(
    state,
    sectionId,
    listKey === "pinned",
    true,
  );
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const filtered = filterEdgeInputs(
    requiredParamIdsToPaths,
    topLevelParamIds,
    impl.edgeInputParams,
  );
  return {
    listKey,
    requiredParamIdsToPaths: filtered.requiredParamIdsToPaths,
    topLevelParamIds: filtered.topLevelParamIds,
  };
}

function filterEdgeInputs(
  requiredParamIdsToPaths: Record<string, Array<string>>,
  topLevelParamIds: Array<string>,
  edgeInputParams: Array<string>,
) {
  if (edgeInputParams.length === 0) {
    return { requiredParamIdsToPaths, topLevelParamIds };
  }
  const edgeInputSet = new Set(edgeInputParams);
  const filteredParamIdsToPaths: Record<string, Array<string>> = {};
  for (const [paramId, path] of Object.entries(requiredParamIdsToPaths)) {
    if (!edgeInputSet.has(paramId)) {
      filteredParamIdsToPaths[paramId] = path;
    }
  }
  const filteredTopLevel = topLevelParamIds.filter(
    (paramId) => !edgeInputSet.has(paramId),
  );
  return {
    requiredParamIdsToPaths: filteredParamIdsToPaths,
    topLevelParamIds: filteredTopLevel,
  };
}

function resetParamDragState() {
  resetParamDndChildren();
  resetParamDndState();
  resetParamDragOverState();
}

function resetParamDragOverState() {
  lastResolvedOverId = null;
  lastResolvedPastHalfway = null;
  lastResolvedTriggerDistCondition = null;
  lastFilteredCollisionEmpty = null;
}

function getCollisionTriggerDistCondition(
  overId: string | number | null,
  collisions: DragOverEvent["collisions"] | null,
): boolean | null {
  if (!collisions || collisions.length === 0) {
    return null;
  }

  if (overId !== null) {
    const matching = collisions.find(
      (collision) => String(collision.id) === String(overId),
    );
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

  const match = collisions.find(
    (collision) => String(collision.id) === String(overId),
  );
  if (!match || match.pastHalfway === undefined) {
    return null;
  }

  return Boolean(match.pastHalfway);
}

function measureParamDragSize(
  manager: DragDropManager | null,
  paramIds: string[],
) {
  let width = 0;
  let height = 0;
  for (const paramId of paramIds) {
    const rect = getDroppableRect(manager, paramId);
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

function measureParamActiveRect(
  manager: DragDropManager | null,
  paramId: string,
  fallbackRect: DragStartEvent["activeRect"] | null,
) {
  return getDroppableRect(manager, paramId) ?? fallbackRect ?? null;
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

function resolveParamDragOffset(
  activeRect: {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null,
) {
  if (!activeRect) {
    return null;
  }
  const lastPointer = useMisc.getState().lastMouseDownLocation;
  if (!lastPointer) {
    return null;
  }
  if (
    lastPointer.x < activeRect.left ||
    lastPointer.x > activeRect.right ||
    lastPointer.y < activeRect.top ||
    lastPointer.y > activeRect.bottom
  ) {
    return null;
  }
  return {
    x: lastPointer.x - activeRect.left,
    y: lastPointer.y - activeRect.top,
  };
}
