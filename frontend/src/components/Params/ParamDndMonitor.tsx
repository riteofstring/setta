import type { DragDropManager } from "@dnd-kit/dom";
import { useDragDropManager } from "@dnd-kit/react";
import { useComputed } from "@dnd-kit/react/hooks";
import type {
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from "forks/dnd-kit/adapter";
import { computeNewIndex, useDndMonitor } from "forks/dnd-kit/adapter";
import { resolveOverCollisionId } from "forks/dnd-kit/adapter/collisionCompare";
import { rectFromBoundingRect } from "forks/dnd-kit/adapter/rect";
import {
  addParamChild,
  getParamDndParentByChild,
  getParamDndParentId,
  replaceParamsWithTemp,
  resetParamDndChildren,
  updateParamChildren,
  useParamDndChildren,
} from "forks/dnd-kit/paramDndChildren";
import {
  getParamDndItemId,
  getParamIdFromDndItemId,
  getTempParamDndId,
  resetParamDndState,
  setParamDndState,
  useParamDndState,
  type ParamListKey,
} from "forks/dnd-kit/paramDndState";
import _ from "lodash";
import { useEffect, useState } from "react";
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

function debugParamDnd(_message: string, _details?: Record<string, unknown>) {}

type ParamDragData = {
  type?: string;
  sectionId?: string;
  listKey?: ParamListKey | null;
  paramId?: string | null;
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
type ParamDragOverInput = Pick<DragMoveEvent, "active" | "collisions" | "over">;
let pendingParamDragOver: ParamDragOverInput | null = null;
let paramDragOverRaf: number | null = null;

export function ParamDndMonitor() {
  const manager = useDragDropManager();
  const pendingReset = useParamDndState((state) => state.pendingReset);
  const isSelectingParams = useMisc((state) => state.isSelectingParams);
  const isIdle = useComputed(
    () => manager?.dragOperation.status.idle ?? true,
    [manager],
  ).value;
  const isDragging = useComputed(
    () => manager?.dragOperation.status.dragging ?? false,
    [manager],
  ).value;
  const isInitializing = useComputed(
    () => manager?.dragOperation.status.initializing ?? false,
    [manager],
  ).value;

  useEffect(() => {
    if (isSelectingParams || !manager) {
      return;
    }
    if (!isDragging && !isInitializing) {
      return;
    }
    const sourceData = manager.dragOperation.source?.data as
      | { current?: { type?: string } }
      | undefined;
    if (sourceData?.current?.type !== "param") {
      return;
    }
    debugParamDnd("cancel:param-select-released");
    manager.actions.stop({ canceled: true });
    deferParamDragReset("param-select-released");
  }, [isDragging, isInitializing, isSelectingParams, manager]);

  useEffect(() => {
    if (!pendingReset || !isIdle) {
      return;
    }
    debugParamDnd("end:reset-after-idle");
    resetParamDragState();
  }, [isIdle, pendingReset]);

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
  const [suppressOverlay, setSuppressOverlay] = useState(false);

  useDndMonitor({
    onDragStart: (event) => {
      if (isParamDrag(event.active)) {
        setSuppressOverlay(false);
        debugParamDnd("overlay:start", {
          activeId: String(event.active.id),
        });
      }
    },
    onDragEnd: (event) => {
      if (isParamDrag(event.active)) {
        setSuppressOverlay(true);
        debugParamDnd("overlay:end", {
          activeId: String(event.active.id),
        });
      }
    },
    onDragCancel: (event) => {
      if (isParamDrag(event.active)) {
        setSuppressOverlay(true);
        debugParamDnd("overlay:cancel", {
          activeId: String(event.active.id),
        });
      }
    },
  });
  const activeDragType = useComputed(() => {
    const sourceData = manager?.dragOperation.source?.data as
      | { current?: { type?: string } }
      | undefined;
    return sourceData?.current?.type ?? null;
  }, [manager]).value;
  const isParamDragActive = activeDragType === "param";
  const { activeId, placeholderWidth, placeholderHeight, activeRect } =
    useParamDndState(
      (state) => ({
        activeId: state.activeId,
        placeholderWidth: state.placeholderWidth,
        placeholderHeight: state.placeholderHeight,
        activeRect: state.activeRect,
      }),
      _.isEqual,
    );
  const dragTransform = useComputed(() => {
    if (!manager) {
      return null;
    }
    const transform = manager.dragOperation.transform;
    return {
      x: transform?.x ?? 0,
      y: transform?.y ?? 0,
    };
  }, [manager]).value;
  const isDropped = useComputed(
    () => manager?.dragOperation.status.dropped ?? false,
    [manager],
  ).value;
  const isDraggingStatus = useComputed(
    () => manager?.dragOperation.status.dragging ?? false,
    [manager],
  ).value;
  const isInitializingStatus = useComputed(
    () => manager?.dragOperation.status.initializing ?? false,
    [manager],
  ).value;
  const shouldRenderOverlay = useComputed(
    () => manager?.dragOperation.status.initialized ?? false,
    [manager],
  ).value;
  const overlayMetrics = activeId
    ? {
        width: placeholderWidth ?? 220,
        height: placeholderHeight ?? 32,
      }
    : null;

  useEffect(() => {
    debugParamDnd("overlay:state", {
      activeId,
      isParamDragActive,
      shouldRenderOverlay,
      isDragging: isDraggingStatus,
      isInitializing: isInitializingStatus,
      isDropped,
      suppressOverlay,
      placeholderWidth,
      placeholderHeight,
    });
  }, [
    activeId,
    isParamDragActive,
    shouldRenderOverlay,
    isDraggingStatus,
    isInitializingStatus,
    isDropped,
    suppressOverlay,
    placeholderWidth,
    placeholderHeight,
  ]);

  if (!shouldRenderOverlay || !isParamDragActive || !overlayMetrics) {
    return null;
  }

  if (suppressOverlay || isDropped) {
    return null;
  }

  if (!isDraggingStatus && !isInitializingStatus) {
    return null;
  }

  const overlayRect = activeRect
    ? {
        top: activeRect.top + (dragTransform?.y ?? 0),
        left: activeRect.left + (dragTransform?.x ?? 0),
        width: activeRect.width,
        height: activeRect.height,
      }
    : null;

  return createPortal(
    overlayRect ? (
      <div
        className="rounded-sm bg-blue-600/80 shadow-md dark:bg-blue-700/70"
        style={{
          position: "fixed",
          top: overlayRect.top,
          left: overlayRect.left,
          width: overlayMetrics.width,
          height: overlayMetrics.height,
          pointerEvents: "none",
          zIndex: 1000,
        }}
      />
    ) : null,
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
  const activeId =
    dragData.paramId ?? getParamIdFromDndItemId(String(event.active.id));
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
  const activeDndId = getParamDndItemId(activeId, view.listKey);
  const draggingDndIds = draggingIds.map((paramId) =>
    getParamDndItemId(paramId, view.listKey),
  );
  const placeholderSize = measureParamDragSize(manager, draggingDndIds);
  const activeRect = measureParamActiveRect(
    manager,
    activeDndId,
    event.activeRect,
  );

  debugParamDnd("start", {
    activeId,
    sectionId,
    listKey: view.listKey,
    draggingIds,
    placeholderSize,
    activeRect,
  });

  updateParamChildren(tree.visibleChildrenByParent);
  replaceParamsWithTemp(activeId, view.listKey, draggingIds);

  setParamDndState({
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
  resetParamDragOverState();
}

function handleParamDragMove(event: DragMoveEvent) {
  scheduleParamDragOver(event);
}

function handleParamDragOver(event: DragOverEvent) {
  scheduleParamDragOver(event);
}

function handleParamDragEnd() {
  const paramState = useParamDndState.getState();
  if (!paramState.activeId || !paramState.sectionId || !paramState.listKey) {
    debugParamDnd("end:missing-state");
    deferParamDragReset("missing-state");
    return;
  }

  const tempId = getTempParamDndId(
    getParamDndItemId(paramState.activeId, paramState.listKey),
  );
  const dndChildrenState = useParamDndChildren.getState();
  const newParentId = dndChildrenState.y[tempId] ?? null;
  if (!newParentId) {
    debugParamDnd("end:no-parent", { tempId });
    deferParamDragReset("no-parent");
    return;
  }

  const tempSiblings = dndChildrenState.x[newParentId] ?? [];
  const tempIndex = tempSiblings.indexOf(tempId);
  if (tempIndex < 0) {
    debugParamDnd("end:temp-not-found", { tempId, newParentId });
    deferParamDragReset("temp-not-found");
    return;
  }

  const state = useProjectState.getState();
  const oldParentId =
    getSharedParentId(paramState.parentById, paramState.draggingIds) ??
    paramState.parentById[paramState.draggingIds[0]] ??
    null;
  if (!oldParentId) {
    debugParamDnd("end:no-old-parent", { tempId });
    deferParamDragReset("no-old-parent");
    return;
  }
  const orderedDraggingIds = orderParamIdsByParent(
    state,
    paramState.sectionId,
    oldParentId,
    paramState.draggingIds,
  );
  if (orderedDraggingIds.length === 0) {
    debugParamDnd("end:empty-ordered", { tempId, oldParentId });
    deferParamDragReset("empty-ordered");
    return;
  }
  if (
    isDescendantOfSelection(
      paramState.parentById,
      newParentId,
      new Set(orderedDraggingIds),
    )
  ) {
    debugParamDnd("end:descendant", { newParentId, orderedDraggingIds });
    deferParamDragReset("descendant");
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
    debugParamDnd("end:new-index-null", {
      newParentId,
      tempIndex,
      orderedDraggingIds,
    });
    deferParamDragReset("new-index-null");
    return;
  }

  if (newParentId === oldParentId && isBaseParentCodeObjImpl(newParentImpl)) {
    const currentIndex = newParentImpl.children.indexOf(orderedDraggingIds[0]);
    if (currentIndex === newIndex) {
      debugParamDnd("end:noop", { newParentId, newIndex });
      deferParamDragReset("noop");
      return;
    }
  }

  debugParamDnd("end:move", {
    oldParentId,
    newParentId,
    newIndex,
    orderedDraggingIds,
  });
  moveParamsWithBackend({
    sectionId: paramState.sectionId,
    paramIds: orderedDraggingIds,
    newParentId,
    newIndex,
  });
  deferParamDragReset("move");
}

function handleParamDragCancel() {
  deferParamDragReset("cancel");
}

function updateParamDragOver({ active, collisions, over }: ParamDragOverInput) {
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
      debugParamDnd("over:filtered-empty", {
        collisions: collisions.map((collision) => String(collision.id)),
        listKey: paramState.listKey,
      });
    }
    return;
  }
  if (lastFilteredCollisionEmpty) {
    lastFilteredCollisionEmpty = false;
    debugParamDnd("over:filtered-resume", {
      collisions: filteredCollisions.map((collision) => String(collision.id)),
      listKey: paramState.listKey,
    });
  }
  const resolvedOverId = resolveOverCollisionId(
    filteredCollisions,
    getOverIdForListKey(over, paramState.listKey),
    getParamDndParentByChild(paramState.listKey),
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
  if (!normalizedOverId) {
    return;
  }
  const overParamId = getParamIdFromDndItemId(normalizedOverId);

  if (
    overParamId === lastResolvedOverId &&
    pastHalfway === lastResolvedPastHalfway &&
    triggerDistCondition === lastResolvedTriggerDistCondition
  ) {
    return;
  }

  lastResolvedOverId = overParamId;
  lastResolvedPastHalfway = pastHalfway;
  lastResolvedTriggerDistCondition = triggerDistCondition;

  debugParamDnd("over:resolved", {
    activeId: paramState.activeId,
    overId: overParamId,
    pastHalfway,
    triggerDistCondition,
    listKey: paramState.listKey,
    collisions: filteredCollisions.map((collision) => String(collision.id)),
  });

  if (!paramState.listKey) {
    return;
  }
  const tempId = getTempParamDndId(
    getParamDndItemId(paramState.activeId, paramState.listKey),
  );
  const oldParentId = getParamDndParentId(tempId) ?? null;

  const newParentId = resolveParamDragParent({
    overId: overParamId,
    parentById: paramState.parentById,
    draggingIds: paramState.draggingIds,
    triggerDistCondition,
  });
  if (!newParentId) {
    return;
  }
  maybeMovePlaceholder({
    tempId,
    overId: overParamId,
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
    debugParamDnd("placeholder:move-parent", {
      tempId,
      oldParentId,
      newParentId,
      overId,
      overIndex,
      index,
      pastHalfway,
    });
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
      debugParamDnd("placeholder:reorder", {
        tempId,
        parentId: newParentId,
        overId,
        activeIndex,
        overIndex,
        nextIndex,
        pastHalfway,
      });
      addParamChild(oldParentId, newParentId, tempId, nextIndex);
    }
  }
}

function getParamDragData(event: DragStartEvent): {
  sectionId: string;
  listKey: ParamListKey | null;
  paramId: string | null;
} | null {
  const data = event.active.data?.current as ParamDragData | undefined;
  if (!data || data.type !== "param" || !data.sectionId) {
    return null;
  }
  return {
    sectionId: data.sectionId,
    listKey: data.listKey ?? null,
    paramId: data.paramId ?? null,
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
  if (shareSession.isDeploymentMode) {
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
  resetScheduledParamDragOver();
  resetParamDndChildren();
  resetParamDndState();
  resetParamDragOverState();
}

function deferParamDragReset(reason: string) {
  resetScheduledParamDragOver();
  resetParamDragOverState();
  setParamDndState({ pendingReset: true });
  debugParamDnd("end:defer-reset", { reason });
}

function resetParamDragOverState() {
  lastResolvedOverId = null;
  lastResolvedPastHalfway = null;
  lastResolvedTriggerDistCondition = null;
  lastFilteredCollisionEmpty = null;
}

function scheduleParamDragOver(event: ParamDragOverInput) {
  pendingParamDragOver = {
    active: event.active,
    collisions: event.collisions,
    over: event.over,
  };
  if (paramDragOverRaf !== null) {
    return;
  }
  paramDragOverRaf = requestAnimationFrame(() => {
    paramDragOverRaf = null;
    const nextEvent = pendingParamDragOver;
    pendingParamDragOver = null;
    if (nextEvent) {
      updateParamDragOver(nextEvent);
    }
  });
}

function resetScheduledParamDragOver() {
  if (paramDragOverRaf !== null) {
    cancelAnimationFrame(paramDragOverRaf);
    paramDragOverRaf = null;
  }
  pendingParamDragOver = null;
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
  dndIds: string[],
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

function measureParamActiveRect(
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
