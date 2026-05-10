import type { DragDropManager } from "@dnd-kit/dom";

import { useDragDropManager } from "@dnd-kit/react";

import { useComputed } from "@dnd-kit/react/hooks";

import type {
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from "forks/dnd-kit/adapter";

import { useDndMonitor } from "forks/dnd-kit/adapter";

import {
  replaceParamsWithTemp,
  updateParamChildren,
  useParamDndChildren,
} from "forks/dnd-kit/paramDndChildren";

import {
  getParamDndItemId,
  getParamIdFromDndItemId,
  getTempParamDndId,
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
} from "state/actions/sectionInfos";

import {
  useMisc,
  useProjectState,
  type ZustandProjectState,
} from "state/definitions";

import {
  isBaseParentCodeObjImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";

import { isParamOverlayVisible } from "../paramDndMonitorUtils";

import {
  ParamDragOverInput,
  canStartParamDrag,
  deferParamDragReset,
  getLoggedFilteredParamCollisions,
  getParamDragData,
  isNoopParamDragMove,
  isParamDrag,
  maybeMovePlaceholder,
  resetParamDragOverState,
  resetParamDragState,
  resolveParamDragOverResolution,
  resolveParamDragPlaceholderMove,
  resolveParamListView,
  scheduleParamDragOver,
  updateResolvedParamDragOverState,
} from "./dragOverState";

import { measureParamActiveRect, measureParamDragSize } from "./dragGeometry";

export function debugParamDnd(
  message: string,
  details?: Record<string, unknown>,
) {
  void message;
  void details;
}

export type ParamDragData = {
  type?: string;
  sectionId?: string;
  listKey?: ParamListKey | null;
  paramId?: string | null;
};

export type ParamListView = {
  listKey: ParamListKey;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  topLevelParamIds: Array<string>;
};

type CollisionSortableData = {
  containerId?: string | number;
  index?: number;
};

export type CollisionDroppableData = {
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

type ParamDndStoreState = ReturnType<typeof useParamDndState.getState>;

type ParamStartDragData = NonNullable<ReturnType<typeof getParamDragData>>;

type ParamDragAbort = {
  reason: string;
  details?: Record<string, unknown>;
};

type ParamDragDropTarget = {
  tempId: string;
  newParentId: string;
  tempIndex: number;
};

type ParamDragOrdering = {
  oldParentId: string;
  orderedDraggingIds: string[];
};

type ParamDragInsertion = {
  newIndex: number;
  newParentImpl: ReturnType<typeof getCurrEffectiveCodeObjImpl>;
};

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

  useParamDragOverlayMonitor(setSuppressOverlay);
  const { overlayMetrics, overlayRect, canRenderOverlay } =
    useParamDragOverlayState(manager, suppressOverlay);

  if (!canRenderOverlay || !overlayMetrics) {
    return null;
  }

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

function useParamDragOverlayMonitor(
  setSuppressOverlay: (nextValue: boolean) => void,
) {
  useDndMonitor({
    onDragStart: (event) => {
      updateParamOverlaySuppression({
        event,
        nextValue: false,
        phase: "start",
        setSuppressOverlay,
      });
    },
    onDragEnd: (event) => {
      updateParamOverlaySuppression({
        event,
        nextValue: true,
        phase: "end",
        setSuppressOverlay,
      });
    },
    onDragCancel: (event) => {
      updateParamOverlaySuppression({
        event,
        nextValue: true,
        phase: "cancel",
        setSuppressOverlay,
      });
    },
  });
}

function useParamDragOverlayState(
  manager: DragDropManager | null,
  suppressOverlay: boolean,
) {
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
  const overlayMetrics = activeId
    ? {
        width: placeholderWidth ?? 220,
        height: placeholderHeight ?? 32,
      }
    : null;
  const overlayRect = activeRect
    ? {
        top: activeRect.top + (dragTransform?.y ?? 0),
        left: activeRect.left + (dragTransform?.x ?? 0),
        width: activeRect.width,
        height: activeRect.height,
      }
    : null;
  const canRenderOverlay = isParamOverlayVisible({
    shouldRenderOverlay,
    isParamDragActive,
    hasOverlayMetrics: overlayMetrics !== null,
    suppressOverlay,
    isDropped,
    isDragging,
    isInitializing,
  });

  useEffect(() => {
    debugParamDnd("overlay:state", {
      activeId,
      isParamDragActive,
      shouldRenderOverlay,
      isDragging,
      isInitializing,
      isDropped,
      suppressOverlay,
      placeholderWidth,
      placeholderHeight,
    });
  }, [
    activeId,
    isParamDragActive,
    shouldRenderOverlay,
    isDragging,
    isInitializing,
    isDropped,
    suppressOverlay,
    placeholderWidth,
    placeholderHeight,
  ]);

  return {
    overlayMetrics,
    overlayRect,
    canRenderOverlay,
  };
}

function updateParamOverlaySuppression({
  event,
  nextValue,
  phase,
  setSuppressOverlay,
}: {
  event: { active: DragStartEvent["active"] };
  nextValue: boolean;
  phase: "start" | "end" | "cancel";
  setSuppressOverlay: (nextValue: boolean) => void;
}) {
  if (!isParamDrag(event.active)) {
    return;
  }
  setSuppressOverlay(nextValue);
  debugParamDnd(`overlay:${phase}`, {
    activeId: String(event.active.id),
  });
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
  const activeId = resolveParamActiveId(dragData, event);
  const rootId = getParamRootId(state, sectionId);
  const parentById = buildParamParentMap(state, sectionId, rootId);
  if (!Object.prototype.hasOwnProperty.call(parentById, activeId)) {
    return;
  }

  const draggingIds = resolveDraggingParamIds({
    sectionId,
    activeId,
    parentById,
    selectedParams: sectionImpl.selectedParams ?? [],
  });

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
  if (!hasActiveParamDragState(paramState)) {
    abortParamDragEnd({ reason: "missing-state" });
    return;
  }

  const dropTarget = resolveParamDragDropTarget(paramState);
  if (isParamDragAbort(dropTarget)) {
    abortParamDragEnd(dropTarget);
    return;
  }
  const state = useProjectState.getState();
  const ordering = resolveParamDragOrdering(
    state,
    paramState,
    dropTarget.tempId,
  );
  if (isParamDragAbort(ordering)) {
    abortParamDragEnd(ordering);
    return;
  }
  if (
    isDescendantOfSelection(
      paramState.parentById,
      dropTarget.newParentId,
      new Set(ordering.orderedDraggingIds),
    )
  ) {
    abortParamDragEnd({
      reason: "descendant",
      details: {
        newParentId: dropTarget.newParentId,
        orderedDraggingIds: ordering.orderedDraggingIds,
      },
    });
    return;
  }

  const insertion = resolveParamDragInsertion({
    state,
    paramState,
    newParentId: dropTarget.newParentId,
    tempIndex: dropTarget.tempIndex,
    orderedDraggingIds: ordering.orderedDraggingIds,
  });
  if (isParamDragAbort(insertion)) {
    abortParamDragEnd(insertion);
    return;
  }

  if (
    isNoopParamDragMove({
      newParentId: dropTarget.newParentId,
      oldParentId: ordering.oldParentId,
      orderedDraggingIds: ordering.orderedDraggingIds,
      newIndex: insertion.newIndex,
      newParentImpl: insertion.newParentImpl,
    })
  ) {
    abortParamDragEnd({
      reason: "noop",
      details: {
        newParentId: dropTarget.newParentId,
        newIndex: insertion.newIndex,
      },
    });
    return;
  }

  debugParamDnd("end:move", {
    oldParentId: ordering.oldParentId,
    newParentId: dropTarget.newParentId,
    newIndex: insertion.newIndex,
    orderedDraggingIds: ordering.orderedDraggingIds,
  });
  moveParamsWithBackend({
    sectionId: paramState.sectionId,
    paramIds: ordering.orderedDraggingIds,
    newParentId: dropTarget.newParentId,
    newIndex: insertion.newIndex,
  });
  deferParamDragReset("move");
}

function handleParamDragCancel() {
  deferParamDragReset("cancel");
}

export function updateParamDragOver({
  active,
  collisions,
  over,
}: ParamDragOverInput) {
  if (!isParamDrag(active)) {
    return;
  }
  const paramState = useParamDndState.getState();
  if (!hasActiveParamDragState(paramState) || !collisions) {
    return;
  }
  const filteredCollisions = getLoggedFilteredParamCollisions(
    collisions,
    paramState.listKey,
  );
  if (!filteredCollisions) {
    return;
  }
  const resolution = resolveParamDragOverResolution({
    filteredCollisions,
    over,
    listKey: paramState.listKey,
    sectionId: paramState.sectionId,
    rootId: paramState.rootId,
  });
  if (!resolution || !updateResolvedParamDragOverState(resolution)) {
    return;
  }

  debugParamDnd("over:resolved", {
    activeId: paramState.activeId,
    overId: resolution.overParamId,
    pastHalfway: resolution.pastHalfway,
    triggerDistCondition: resolution.triggerDistCondition,
    listKey: paramState.listKey,
    collisions: resolution.filteredCollisions.map((collision) =>
      String(collision.id),
    ),
  });
  const placeholderMove = resolveParamDragPlaceholderMove({
    activeId: paramState.activeId,
    listKey: paramState.listKey,
    parentById: paramState.parentById,
    draggingIds: paramState.draggingIds,
    overId: resolution.overParamId,
    pastHalfway: resolution.pastHalfway,
    triggerDistCondition: resolution.triggerDistCondition,
  });
  if (!placeholderMove) {
    return;
  }
  maybeMovePlaceholder(placeholderMove);
}

function hasActiveParamDragState(
  paramState: ParamDndStoreState,
): paramState is ParamDndStoreState & {
  activeId: string;
  sectionId: string;
  listKey: ParamListKey;
} {
  return Boolean(
    paramState.activeId && paramState.sectionId && paramState.listKey,
  );
}

function resolveParamActiveId(
  dragData: ParamStartDragData,
  event: DragStartEvent,
) {
  return dragData.paramId ?? getParamIdFromDndItemId(String(event.active.id));
}

function resolveDraggingParamIds({
  sectionId,
  activeId,
  parentById,
  selectedParams,
}: {
  sectionId: string;
  activeId: string;
  parentById: Record<string, string | null>;
  selectedParams: string[];
}) {
  if (!selectedParams.includes(activeId)) {
    selectOnlyParam(sectionId, activeId);
    return [activeId];
  }

  const rootSelected = getRootSelectedParamIds(parentById, selectedParams);
  const draggingIds = rootSelected.length > 0 ? rootSelected : [activeId];
  if (draggingIds.length === 1) {
    return draggingIds;
  }
  if (getSharedParentId(parentById, draggingIds)) {
    return draggingIds;
  }

  addTemporaryNotification("Param selection spans multiple parents.");
  selectOnlyParam(sectionId, activeId);
  return [activeId];
}

function abortParamDragEnd({ reason, details }: ParamDragAbort) {
  debugParamDnd(`end:${reason}`, details);
  deferParamDragReset(reason);
}

function isParamDragAbort<T>(
  result: T | ParamDragAbort,
): result is ParamDragAbort {
  return typeof result === "object" && result !== null && "reason" in result;
}

function resolveParamDragDropTarget(
  paramState: ParamDndStoreState & {
    activeId: string;
    sectionId: string;
    listKey: ParamListKey;
  },
): ParamDragDropTarget | ParamDragAbort {
  const tempId = getTempParamDndId(
    getParamDndItemId(paramState.activeId, paramState.listKey),
  );
  const dndChildrenState = useParamDndChildren.getState();
  const newParentId = dndChildrenState.y[tempId] ?? null;
  if (!newParentId) {
    return { reason: "no-parent", details: { tempId } };
  }
  const tempSiblings = dndChildrenState.x[newParentId] ?? [];
  const tempIndex = tempSiblings.indexOf(tempId);
  if (tempIndex < 0) {
    return {
      reason: "temp-not-found",
      details: { tempId, newParentId },
    };
  }
  return {
    tempId,
    newParentId,
    tempIndex,
  };
}

function resolveParamDragOrdering(
  state: ZustandProjectState,
  paramState: ParamDndStoreState & {
    activeId: string;
    sectionId: string;
    listKey: ParamListKey;
  },
  tempId: string,
): ParamDragOrdering | ParamDragAbort {
  const oldParentId =
    getSharedParentId(paramState.parentById, paramState.draggingIds) ??
    paramState.parentById[paramState.draggingIds[0]] ??
    null;
  if (!oldParentId) {
    return { reason: "no-old-parent", details: { tempId } };
  }
  const orderedDraggingIds = orderParamIdsByParent(
    state,
    paramState.sectionId,
    oldParentId,
    paramState.draggingIds,
  );
  if (orderedDraggingIds.length === 0) {
    return {
      reason: "empty-ordered",
      details: { tempId, oldParentId },
    };
  }
  return {
    oldParentId,
    orderedDraggingIds,
  };
}

function resolveParamDragInsertion({
  state,
  paramState,
  newParentId,
  tempIndex,
  orderedDraggingIds,
}: {
  state: ZustandProjectState;
  paramState: ParamDndStoreState & {
    activeId: string;
    sectionId: string;
    listKey: ParamListKey;
  };
  newParentId: string;
  tempIndex: number;
  orderedDraggingIds: string[];
}): ParamDragInsertion | ParamDragAbort {
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
    return {
      reason: "new-index-null",
      details: {
        newParentId,
        tempIndex,
        orderedDraggingIds,
      },
    };
  }
  return {
    newIndex,
    newParentImpl,
  };
}
