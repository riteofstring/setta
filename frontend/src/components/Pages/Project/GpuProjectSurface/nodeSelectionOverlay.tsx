import cc from "classcat";

import { useDndMode } from "forks/dnd-kit/dndState";

import {
  setSelectionDragHandle,
  setSelectionDragPrimaryId,
} from "forks/dnd-kit/selectionDragHandle";

import {
  cancelGpuAnimationFrame,
  requestGpuAnimationFrame,
} from "gpuFlow/animationFrame";

import type { NodeDragItem } from "gpuFlow/flowTypes";

import { getGpuNodeDragAutoPanDelta } from "gpuFlow/interactions/nodeDrag";

import { REACT_FLOW_COMPAT_CLASS_NAMES } from "gpuFlow/reactFlowCompatibility";

import {
  shiftNodesSelectionBounds,
  updateActiveNodesSelectionBounds,
} from "gpuFlow/selectionBounds";

import { panGpuViewport, screenToFlowPosition } from "gpuFlow/viewportActions";

import { useGpuFlowViewportStore } from "gpuFlow/viewportHooks";

import {
  getGpuViewportStorePointRelativeToDomNode,
  gpuFlowViewportStore,
} from "gpuFlow/viewportStore";

import _ from "lodash";

import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import { applyActiveSectionChange } from "state/actions/activeSectionController";

import { setActiveSectionIds } from "state/actions/activeSections";

import { openSelectionContextMenu } from "state/actions/contextMenus";

import {
  getNodes,
  raiseTempZIndex,
  updateNodePositions,
} from "state/actions/nodeInternals";

import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";

import { setZIndices } from "state/actions/sections/sectionPositions";

import {
  getActiveSectionUIIds,
  useActiveSectionUI,
} from "state/activeSectionUI";

import {
  useLocalStorage,
  useMisc,
  useNodeInternals,
  useProjectState,
  useSettings,
} from "state/definitions";

import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";

import {
  isProjectGpuSelectionBoxDragDisabled,
  shouldShiftProjectGpuSelectionBoundsForNodeMove,
} from "./gpuProjectInteractionGuards";

import {
  buildProjectSelectionKeyboardNudgePlan,
  moveProjectSelectionDragItems,
  snapProjectSelectionDragItems,
} from "./gpuProjectSelectionMovement";

import {
  ProjectGpuNodeDragChange,
  ProjectGpuNodeDragItem,
  ProjectGpuSelectionChange,
  ProjectSelectionDragState,
  SELECTION_ARROW_KEY_DIFFS,
  useProjectGpuSurfaceSettings,
} from "./projectGpuSurface";

export function GpuProjectNodesSelectionOverlay({
  snapToGrid,
}: {
  readonly snapToGrid: boolean;
}) {
  const bounds = useGpuFlowViewportStore(
    (state) => state.nodesSelectionBounds,
    _.isEqual,
  );
  const transformString = useGpuFlowViewportStore(
    (state) =>
      `translate(${state.transform[0]}px,${state.transform[1]}px) scale(${state.transform[2]})`,
  );
  const { isMovingFree, isSorting } = useDndMode();
  const activeIds = useActiveSectionUI((state) => state.activeIds, _.isEqual);
  const primarySelectionId =
    activeIds.length > 0 ? activeIds[activeIds.length - 1] ?? null : null;
  const hasSelectionBounds = bounds !== null;
  const rectRef = useRef<HTMLDivElement | null>(null);
  const autoPanFrameRef = useRef<number | null>(null);
  const dragStateRef = useRef<ProjectSelectionDragState | null>(null);

  useEffect(() => {
    setSelectionDragPrimaryId(primarySelectionId);
  }, [primarySelectionId]);

  useEffect(() => {
    return () => {
      setSelectionDragPrimaryId(null);
      setSelectionDragHandle(null);
    };
  }, []);

  useEffect(() => {
    if (!isMovingFree) {
      setSelectionDragHandle(null);
      return;
    }
    setSelectionDragHandle(rectRef.current);
    return () => {
      setSelectionDragHandle(null);
    };
  }, [isMovingFree, bounds]);

  useEffect(() => {
    if (hasSelectionBounds && primarySelectionId) {
      rectRef.current?.focus({ preventScroll: true });
    }
  }, [hasSelectionBounds, primarySelectionId]);

  useEffect(() => {
    if ((!hasSelectionBounds || !primarySelectionId) && dragStateRef.current) {
      finishProjectSelectionDrag(dragStateRef, autoPanFrameRef);
    }
  }, [hasSelectionBounds, primarySelectionId]);

  useEffect(() => {
    return () => {
      if (dragStateRef.current) {
        finishProjectSelectionDrag(dragStateRef, autoPanFrameRef);
        return;
      }
      cancelProjectSelectionAutoPan(autoPanFrameRef);
    };
  }, []);

  const updateSelectionDragFromScreenPoint = (screenPoint: {
    readonly x: number;
    readonly y: number;
  }): boolean => {
    const dragState = dragStateRef.current;
    if (!dragState) {
      return false;
    }
    const nextFlowPoint = screenToFlowPosition(screenPoint);
    const result = moveProjectSelectionDragItems({
      items: dragState.items,
      lastFlowPoint: dragState.lastFlowPoint,
      nextFlowPoint,
    });
    dragState.lastFlowPoint = nextFlowPoint;
    if (!result.changed) {
      return false;
    }
    dragState.items = result.items;
    updateNodePositions(dragState.items);
    updateProjectSelectionBoundsAfterMovedNodes({
      delta: result.delta,
      movedNodeIds: dragState.items.map((item) => item.id),
    });
    return true;
  };

  const runSelectionDragAutoPan = () => {
    autoPanFrameRef.current = null;
    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }
    const viewportState = gpuFlowViewportStore.getState();
    const autoPanDelta = getGpuNodeDragAutoPanDelta({
      point: getGpuViewportStorePointRelativeToDomNode(
        dragState.lastScreenPoint,
      ),
      viewportSize: {
        height: viewportState.height,
        width: viewportState.width,
      },
    });
    if (
      (autoPanDelta.x !== 0 || autoPanDelta.y !== 0) &&
      panGpuViewport(autoPanDelta)
    ) {
      updateSelectionDragFromScreenPoint(dragState.lastScreenPoint);
    }
    startProjectSelectionAutoPan(autoPanFrameRef, runSelectionDragAutoPan);
  };

  if (!bounds || !primarySelectionId) {
    return null;
  }

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const activeSectionIds = getActiveSectionUIIds();
    const selectedNodeIds = getNodes()
      .filter((node) => activeSectionIds.includes(node.id))
      .map((node) => node.id);
    openSelectionContextMenu(event, selectedNodeIds);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const diff = SELECTION_ARROW_KEY_DIFFS[event.key];
    if (!diff) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    updateSelectedNodePositionsFromKeyboard({
      isShiftPressed: event.shiftKey,
      x: diff.x,
      y: diff.y,
    });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event.button !== 0 ||
      isProjectGpuSelectionBoxDragDisabled({
        dndMode: { isMovingFree, isSorting },
      }) ||
      eventTargetsNoDragElement(event.nativeEvent)
    ) {
      return;
    }
    const selectedNodeIds = getActiveSectionUIIds();
    if (selectedNodeIds.length === 0) {
      return;
    }
    const selectedNodes = getNodes().filter(
      (node) =>
        selectedNodeIds.includes(node.id) && canDragProjectNode(node.id),
    );
    if (selectedNodes.length === 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    rectRef.current?.focus({ preventScroll: true });
    raiseTempZIndex(selectedNodes);
    useMisc.setState({ mouseDownDraggingSection: true });
    gpuFlowViewportStore
      .getState()
      .setViewportInteractionFlags({ nodeDragging: true });
    dragStateRef.current = {
      items: selectedNodes.map((node) => ({
        distance: { x: 0, y: 0 },
        height: node.height,
        id: node.id,
        position: { ...node.position },
        width: node.width,
      })),
      lastFlowPoint: screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }),
      lastScreenPoint: {
        x: event.clientX,
        y: event.clientY,
      },
      pointerId: event.pointerId,
      selectedNodeIds: selectedNodes.map((node) => node.id),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    startProjectSelectionAutoPan(autoPanFrameRef, runSelectionDragAutoPan);
  };

  const handleSelectionDragPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragState.lastScreenPoint = {
      x: event.clientX,
      y: event.clientY,
    };
    updateSelectionDragFromScreenPoint(dragState.lastScreenPoint);
  };

  const handleSelectionDragPointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (snapToGrid) {
      const snapGrid = useSettings.getState().gui.snapGrid;
      const snapResult = snapProjectSelectionDragItems({
        items: dragState.items,
        snapGrid,
      });
      dragState.items = snapResult.items;
      if (snapResult.changed) {
        updateNodePositions(dragState.items);
      }
    }
    finishProjectSelectionDrag(dragStateRef, autoPanFrameRef);
  };

  const handleSelectionDragPointerCancel = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    finishProjectSelectionDrag(dragStateRef, autoPanFrameRef);
  };

  return (
    <div
      className={cc([
        REACT_FLOW_COMPAT_CLASS_NAMES.nodesSelection,
        REACT_FLOW_COMPAT_CLASS_NAMES.container,
        NO_PAN_CLASS_NAME,
      ])}
      style={{ transform: transformString }}
    >
      <div
        className={REACT_FLOW_COMPAT_CLASS_NAMES.nodesSelectionRect}
        data-id={primarySelectionId}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handleSelectionDragPointerMove}
        onPointerUp={handleSelectionDragPointerUp}
        onPointerCancel={handleSelectionDragPointerCancel}
        ref={rectRef}
        style={{
          height: bounds.height,
          left: bounds.x,
          pointerEvents: isSorting ? "none" : undefined,
          top: bounds.y,
          width: bounds.width,
        }}
        tabIndex={-1}
      />
    </div>
  );
}

export function finishProjectSelectionDrag(
  dragStateRef: RefObject<ProjectSelectionDragState | null>,
  autoPanFrameRef: RefObject<number | null>,
) {
  cancelProjectSelectionAutoPan(autoPanFrameRef);
  const dragState = dragStateRef.current;
  dragStateRef.current = null;
  if (!dragState) {
    return;
  }
  useMisc.setState({ mouseDownDraggingSection: false });
  gpuFlowViewportStore
    .getState()
    .setViewportInteractionFlags({ nodeDragging: false });
  setZIndices([...dragState.selectedNodeIds], true);
  updateActiveNodesSelectionBounds();
}

export function startProjectSelectionAutoPan(
  autoPanFrameRef: RefObject<number | null>,
  callback: FrameRequestCallback,
) {
  if (autoPanFrameRef.current !== null) {
    return;
  }
  autoPanFrameRef.current = requestGpuAnimationFrame(callback);
}

export function cancelProjectSelectionAutoPan(
  autoPanFrameRef: RefObject<number | null>,
) {
  if (autoPanFrameRef.current === null) {
    return;
  }
  cancelGpuAnimationFrame(autoPanFrameRef.current);
  autoPanFrameRef.current = null;
}

export function handleProjectNodeDragStart(change: ProjectGpuNodeDragChange) {
  const nodesById = useNodeInternals.getState().x;
  const nodes = change.items
    .map((item) => nodesById.get(item.nodeId))
    .filter((node) => node !== undefined);
  raiseTempZIndex(nodes);
  useMisc.setState({ mouseDownDraggingSection: true });
}

export function handleProjectNodeDrag(change: ProjectGpuNodeDragChange) {
  updateNodePositions(toNodeDragItems(change.items));
  updateProjectSelectionBoundsAfterMovedNodes({
    delta: change.delta,
    movedNodeIds: change.items.map((item) => item.nodeId),
  });
}

export function handleProjectNodeDragStop(change: ProjectGpuNodeDragChange) {
  updateNodePositions(toNodeDragItems(change.items));
  useMisc.setState({ mouseDownDraggingSection: false });
  setZIndices(
    change.items.map((item) => item.nodeId),
    true,
  );
  if (gpuFlowViewportStore.getState().nodesSelectionBounds) {
    updateActiveNodesSelectionBounds();
  }
}

export function handleProjectNodeDragCancel(change: ProjectGpuNodeDragChange) {
  useMisc.setState({ mouseDownDraggingSection: false });
  setZIndices(
    change.items.map((item) => item.nodeId),
    true,
  );
  if (gpuFlowViewportStore.getState().nodesSelectionBounds) {
    updateActiveNodesSelectionBounds();
  }
}

export function handleProjectSelectionChange(
  change: ProjectGpuSelectionChange,
) {
  if (change.phase === "start") {
    applyActiveSectionChange(
      { interaction: "selection-rect", selectedIds: [] },
      { syncMode: "ui-only" },
    );
    return;
  }
  if (change.phase === "change") {
    applyActiveSectionChange(
      {
        interaction: "selection-rect",
        selectedIds: [...change.selectedNodeIds],
      },
      { syncMode: "ui-only" },
    );
    return;
  }
  if (change.phase === "end") {
    if (change.selectedNodeIds.length > 0) {
      updateActiveNodesSelectionBounds();
    }
    if (change.active) {
      setActiveSectionIds(getActiveSectionUIIds(), {
        forceDurableSync: true,
      });
    }
  }
}

export function updateSelectedNodePositionsFromKeyboard({
  isShiftPressed,
  x,
  y,
}: {
  readonly isShiftPressed: boolean;
  readonly x: number;
  readonly y: number;
}) {
  const nodesSelectionBounds =
    gpuFlowViewportStore.getState().nodesSelectionBounds;
  const { snapGrid } = useSettings.getState().gui;
  const snapToGrid = useLocalStorage.getState().snapToGrid;
  const activeSectionIds = getActiveSectionUIIds();
  const selectedNodes = getNodes().filter(
    (node) => activeSectionIds.includes(node.id) && canDragProjectNode(node.id),
  );
  const nudgePlan = buildProjectSelectionKeyboardNudgePlan({
    direction: { x, y },
    isShiftPressed,
    selectedNodes,
    snapGrid,
    snapToGrid,
  });
  if (!nudgePlan) {
    return;
  }
  updateNodePositions(nudgePlan.items);
  if (nodesSelectionBounds) {
    updateProjectSelectionBoundsAfterMovedNodes({
      delta: nudgePlan.delta,
      forceRefresh: nudgePlan.forceRefreshBounds,
      movedNodeIds: nudgePlan.items.map((item) => item.id),
    });
  }
}

export function updateProjectSelectionBoundsAfterMovedNodes({
  delta,
  forceRefresh = false,
  movedNodeIds,
}: {
  readonly delta: { readonly x: number; readonly y: number };
  readonly forceRefresh?: boolean | undefined;
  readonly movedNodeIds: readonly string[];
}) {
  if (!gpuFlowViewportStore.getState().nodesSelectionBounds) {
    return;
  }
  if (
    !forceRefresh &&
    shouldShiftProjectGpuSelectionBoundsForNodeMove({
      activeSelectedNodeIds: getActiveSectionUIIds(),
      movedNodeIds,
    })
  ) {
    shiftNodesSelectionBounds(delta);
    return;
  }
  updateActiveNodesSelectionBounds();
}

export function toNodeDragItems(
  items: readonly ProjectGpuNodeDragItem[],
): NodeDragItem[] {
  return items.map((item) => ({
    distance: item.distance,
    height: item.height,
    id: item.nodeId,
    position: item.position,
    width: item.width,
  }));
}

export function canDragProjectNode(nodeId: string): boolean {
  return !getCurrEffectiveSectionImpl(useProjectState.getState(), nodeId)
    .positionAndSizeLocked;
}

export function eventTargetsNoDragElement(event: Event): boolean {
  const target = event.target;
  return (
    target instanceof Element &&
    target.closest(`.${NO_DRAG_CLASS_NAME}`) !== null
  );
}

export function resolveProjectWireColor({
  darkMode,
  settings,
}: {
  readonly darkMode: boolean;
  readonly settings: ReturnType<typeof useProjectGpuSurfaceSettings>;
}): string {
  const light = settings.wireColor ?? "#41506c";
  const dark = settings.wireColorDarkMode ?? "#bac2d3";
  return darkMode ? dark : light;
}

export function getVisibleProjectSurfaceWidth(width: number): number {
  const localStorageState = useLocalStorage.getState();
  return (
    width -
      localStorageState.overviewTrueWidth -
      localStorageState.uiEditorTrueWidth || 500
  );
}
