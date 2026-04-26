import { useDndState } from "forks/dnd-kit/dndState";
import { useReactFlow } from "forks/xyflow/core/store";
import type { Connection, HandleType } from "forks/xyflow/core/types";
import { getWheelDelta } from "forks/xyflow/core/utils";
import { getNodesInside } from "forks/xyflow/core/utils/graph";
import {
  useCallback,
  useEffect,
  useRef,
  type DragEvent,
  type MouseEvent,
  type MutableRefObject,
  type PointerEvent,
  type RefObject,
} from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import {
  setActiveSectionIds,
  type SetActiveSectionIdsOptions,
} from "state/actions/activeSections";
import { toggleAgenticEdgeSelection } from "state/actions/agenticEdges";
import {
  closeAllContextMenus,
  openPaneContextMenu,
} from "state/actions/contextMenus";
import {
  isValidDataEdgeConnection,
  reconnectEdgeFromConnection,
  toggleEdgeSelection,
} from "state/actions/edges";
import { flushPendingNodeDimensionLayoutPersistence } from "state/actions/nodeInternals";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  flushDeferredViewportPersistence,
  manualDndChildrenReset,
} from "state/actions/sectionInfos";
import { openFileAsSectionForDrop } from "state/actions/sections/createSections";
import { moveSectionsWithBackend } from "state/actions/sections/moveSections";
import { toggleStateMachineEdgeSelection } from "state/actions/stateMachineEdges";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import { useEdgeHandleRegistry, useMisc, useSettings } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { NO_WHEEL_CLASS_NAME } from "utils/constants";
import { getFileBrowserDragPayload } from "utils/fileBrowserDragPayload";
import {
  NotificationTypeEnum,
  PanOnScrollModeEnum,
  SelectionModeEnum,
} from "utils/generatedTypes";
import { importNativeFileToWorkspace } from "utils/nativeFileImport";
import { isMacOs } from "utils/utils";
import {
  getCanvasFlowEdgeHit,
  type CanvasFlowEdgeHit,
} from "./canvasFlowEdges";
import { publishCanvasFlowLiveViewport } from "./canvasFlowLiveViewport";
import {
  getCanvasFlowNestedDragSource,
  getCanvasFlowNestedDropTarget,
  resolveCanvasFlowNestedDndDropPlan,
  type CanvasFlowClientPoint,
  type CanvasFlowClientRect,
} from "./canvasFlowNestedDnd";
import type {
  CanvasFlowDrawableEdge,
  CanvasFlowHandlePosition,
  CanvasFlowViewport,
} from "./canvasFlowTypes";
import {
  canvasFlowViewportToTransform,
  clampZoom,
  panViewportByScreenDelta,
  screenToWorldPoint,
  zoomViewportAroundScreenPoint,
} from "./canvasFlowViewport";

type CanvasFlowInteractionHandlers = {
  onClick: (event: MouseEvent<HTMLCanvasElement>) => void;
  onContextMenu: (event: MouseEvent<HTMLCanvasElement>) => void;
  onDragOver: (event: DragEvent<HTMLCanvasElement>) => void;
  onDrop: (event: DragEvent<HTMLCanvasElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void;
  onPointerLeave: (event: PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void;
};

type UseCanvasFlowInteractionsParams = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  edgesRef: MutableRefObject<CanvasFlowDrawableEdge[]>;
  maxZoom: number;
  minZoom: number;
  panOnDrag: boolean | number[];
  panOnScroll: boolean;
  panOnScrollMode: PanOnScrollMode;
  panOnScrollSpeed: number;
  schedulePaint: () => void;
  viewportRef: MutableRefObject<CanvasFlowViewport>;
  zoomActivationKeyPressed: boolean;
  zoomOnPinch: boolean;
  zoomOnScroll: boolean;
};

type PointerGesture =
  | {
      mode: "pan";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      lastClientX: number;
      lastClientY: number;
      moved: boolean;
    }
  | {
      mode: "select";
      pointerId: number;
      startX: number;
      startY: number;
      moved: boolean;
    }
  | {
      mode: "edge";
      edgeHit: CanvasFlowEdgeHit;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      moved: boolean;
    }
  | {
      mode: "edge-reconnect";
      edgeHit: CanvasFlowEdgeHit;
      pointerId: number;
      reconnectTarget: CanvasFlowReconnectTarget;
    }
  | {
      mode: "nested-dnd";
      draggingRectsById: Record<string, CanvasFlowClientRect>;
      moved: boolean;
      pointerId: number;
      sectionIds: string[];
      sourceId: string;
      startPoint: CanvasFlowClientPoint;
    };
type EdgePointerGesture = Extract<PointerGesture, { mode: "edge" }>;
type EdgeReconnectPointerGesture = Extract<
  PointerGesture,
  { mode: "edge-reconnect" }
>;
type NestedDndPointerGesture = Extract<PointerGesture, { mode: "nested-dnd" }>;
type PanPointerGesture = Extract<PointerGesture, { mode: "pan" }>;
type SelectPointerGesture = Extract<PointerGesture, { mode: "select" }>;
type CanvasFlowReconnectTarget = {
  handleId: string | null;
  handleType: HandleType;
  isTarget: boolean;
  nodeId: string;
};

const STORE_VIEWPORT_SYNC_DELAY_MS = 120;
const PAN_SCROLL_IDLE_DELAY_MS = 96;
const WHEEL_ZOOM_IDLE_DELAY_MS = 96;
const VIEWPORT_DURABLE_SYNC_DELAY_MS = 80;

export function useCanvasFlowInteractions({
  canvasRef,
  edgesRef,
  maxZoom,
  minZoom,
  panOnDrag,
  panOnScroll,
  panOnScrollMode,
  panOnScrollSpeed,
  schedulePaint,
  viewportRef,
  zoomActivationKeyPressed,
  zoomOnPinch,
  zoomOnScroll,
}: UseCanvasFlowInteractionsParams): CanvasFlowInteractionHandlers {
  const gestureRef = useRef<PointerGesture | null>(null);
  const suppressNextClickRef = useRef(false);
  const storeSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const panScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const wheelZoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const durableViewportSyncTimeoutRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const { canEditLayout } = useShareCapabilities();

  const syncStoreViewport = useCallback(() => {
    const viewport = viewportRef.current;
    const transform = canvasFlowViewportToTransform(viewport);
    const currentTransform = useReactFlow.getState().transform;
    if (
      currentTransform[0] === transform[0] &&
      currentTransform[1] === transform[1] &&
      currentTransform[2] === transform[2]
    ) {
      return;
    }
    useReactFlow.setState({ transform });
  }, [viewportRef]);

  const scheduleStoreViewportSync = useCallback(() => {
    clearTimeout(storeSyncTimeoutRef.current);
    storeSyncTimeoutRef.current = setTimeout(
      syncStoreViewport,
      STORE_VIEWPORT_SYNC_DELAY_MS,
    );
  }, [syncStoreViewport]);

  const commitViewportChange = useCallback(() => {
    dispatchCanvasFlowViewportChange(viewportRef.current);
    schedulePaint();
    scheduleStoreViewportSync();
  }, [schedulePaint, scheduleStoreViewportSync, viewportRef]);

  const runDurableViewportSync = useCallback(() => {
    durableViewportSyncTimeoutRef.current = undefined;
    clearTimeout(storeSyncTimeoutRef.current);
    syncStoreViewport();
    recordCanvasFlowInteractionMetric(
      canvasRef.current,
      "viewportDurableSyncs",
    );
    flushDeferredViewportPersistence();
    flushPendingNodeDimensionLayoutPersistence();
  }, [canvasRef, syncStoreViewport]);

  const scheduleDurableViewportSync = useCallback(() => {
    clearTimeout(durableViewportSyncTimeoutRef.current);
    durableViewportSyncTimeoutRef.current = setTimeout(
      runDurableViewportSync,
      VIEWPORT_DURABLE_SYNC_DELAY_MS,
    );
  }, [runDurableViewportSync]);

  const finishViewportGesture = useCallback(() => {
    clearTimeout(storeSyncTimeoutRef.current);
    useReactFlow.setState({
      paneDragging: false,
      viewportInteractionActive: false,
    });
    useMisc.setState({ isPanScrolling: false });
    dispatchCanvasFlowViewportChange(viewportRef.current);
    recordCanvasFlowInteractionMetric(canvasRef.current, "viewportFinalizes");
    scheduleDurableViewportSync();
  }, [canvasRef, scheduleDurableViewportSync, viewportRef]);

  const startWheelInteraction = useCallback(
    (kind: "pan" | "zoom") => {
      useReactFlow.setState({ viewportInteractionActive: true });
      if (kind === "pan") {
        useMisc.setState({ isPanScrolling: true });
        clearTimeout(panScrollTimeoutRef.current);
        panScrollTimeoutRef.current = setTimeout(() => {
          useMisc.setState({ isPanScrolling: false });
          useReactFlow.setState({ viewportInteractionActive: false });
          dispatchCanvasFlowViewportChange(viewportRef.current);
          recordCanvasFlowInteractionMetric(
            canvasRef.current,
            "viewportFinalizes",
          );
          scheduleDurableViewportSync();
        }, PAN_SCROLL_IDLE_DELAY_MS);
        return;
      }
      clearTimeout(wheelZoomTimeoutRef.current);
      wheelZoomTimeoutRef.current = setTimeout(() => {
        useReactFlow.setState({ viewportInteractionActive: false });
        dispatchCanvasFlowViewportChange(viewportRef.current);
        recordCanvasFlowInteractionMetric(
          canvasRef.current,
          "viewportFinalizes",
        );
        scheduleDurableViewportSync();
      }, WHEEL_ZOOM_IDLE_DELAY_MS);
    },
    [canvasRef, scheduleDurableViewportSync, viewportRef],
  );

  useEffect(() => {
    return () => {
      clearTimeout(storeSyncTimeoutRef.current);
      clearTimeout(panScrollTimeoutRef.current);
      clearTimeout(wheelZoomTimeoutRef.current);
      clearTimeout(durableViewportSyncTimeoutRef.current);
    };
  }, []);

  const onClick = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        event.preventDefault();
        return;
      }
      if (event.target !== event.currentTarget) {
        return;
      }
      const edgeHit = getEdgeHitForEvent({
        canvas: event.currentTarget,
        edges: edgesRef.current,
        event,
        viewport: viewportRef.current,
      });
      if (edgeHit && !edgeHit.endpoint) {
        event.preventDefault();
        toggleCanvasFlowEdgeSelection(edgeHit.edge);
        schedulePaint();
        return;
      }
      onBackgroundClick(event, viewportRef.current, { forceDurableSync: true });
    },
    [edgesRef, schedulePaint, viewportRef],
  );

  const onContextMenu = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      const edgeHit = getEdgeHitForEvent({
        canvas: event.currentTarget,
        edges: edgesRef.current,
        event,
        viewport: viewportRef.current,
      });
      if (edgeHit) {
        event.preventDefault();
        return;
      }
      if (Array.isArray(panOnDrag) && panOnDrag.includes(2)) {
        event.preventDefault();
        return;
      }
      openPaneContextMenu(event);
    },
    [edgesRef, panOnDrag, viewportRef],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      syncStoreViewport();
      if (event.target !== event.currentTarget) {
        return;
      }
      if (
        tryStartNestedDndPointerGesture({
          canEditLayout,
          event,
          gestureRef,
          suppressNextClickRef,
        })
      ) {
        return;
      }
      if (
        tryStartEdgePointerGesture({
          edges: edgesRef.current,
          event,
          gestureRef,
          suppressNextClickRef,
          viewport: viewportRef.current,
        })
      ) {
        return;
      }
      if (tryStartSelectionPointerGesture({ event, gestureRef })) {
        return;
      }
      if (!isPanButtonAllowed(event.button, panOnDrag)) {
        return;
      }
      startPanPointerGesture({ event, gestureRef });
    },
    [canEditLayout, edgesRef, panOnDrag, syncStoreViewport, viewportRef],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) {
        return;
      }
      switch (gesture.mode) {
        case "edge":
          updateEdgeGestureMove(gesture, event);
          return;
        case "edge-reconnect":
          updateEdgeReconnectGestureMove({
            canvas: event.currentTarget,
            event,
            gesture,
            viewport: viewportRef.current,
          });
          return;
        case "nested-dnd":
          updateNestedDndGestureMove(gesture, event);
          return;
        case "pan":
          updatePanGestureMove({
            commitViewportChange,
            event,
            gesture,
            viewportRef,
          });
          return;
        case "select":
          updateSelectionGestureMove({
            event,
            gesture,
            viewport: viewportRef.current,
          });
      }
    },
    [commitViewportChange, viewportRef],
  );

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) {
        return;
      }
      event.currentTarget.releasePointerCapture(event.pointerId);
      gestureRef.current = null;
      finishPointerGesture({
        event,
        finishViewportGesture,
        gesture,
        schedulePaint,
        suppressNextClickRef,
        viewport: viewportRef.current,
      });
    },
    [finishViewportGesture, schedulePaint, viewportRef],
  );

  const onPointerLeave = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (!gestureRef.current) {
        return;
      }
      if (gestureRef.current.mode === "edge") {
        gestureRef.current.moved = true;
      }
      if (gestureRef.current.mode === "edge-reconnect") {
        cancelCanvasFlowConnection();
      }
      onPointerUp(event);
    },
    [onPointerUp],
  );

  const handleWheelEvent = useCallback(
    (event: WheelEvent) => {
      if (
        shouldIgnoreWheelEvent({
          ctrlKey: event.ctrlKey,
          target: event.target,
          zoomActivationKeyPressed,
          zoomOnPinch,
        })
      ) {
        return;
      }
      event.preventDefault();
      if (
        shouldPanCanvasFlowWheel({
          event,
          panOnScroll,
          zoomActivationKeyPressed,
          zoomOnPinch,
          zoomOnScroll,
        })
      ) {
        startWheelInteraction("pan");
        panCanvasFlowByWheel({
          commitViewportChange,
          event,
          panOnScrollMode,
          panOnScrollSpeed,
          viewportRef,
        });
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      startWheelInteraction("zoom");
      if (
        zoomCanvasFlowByWheel({
          canvas,
          commitViewportChange,
          event,
          maxZoom,
          minZoom,
          viewportRef,
        })
      ) {
        return;
      }
    },
    [
      canvasRef,
      commitViewportChange,
      maxZoom,
      minZoom,
      panOnScroll,
      panOnScrollMode,
      panOnScrollSpeed,
      startWheelInteraction,
      viewportRef,
      zoomActivationKeyPressed,
      zoomOnPinch,
      zoomOnScroll,
    ],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.addEventListener("wheel", handleWheelEvent, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleWheelEvent);
    };
  }, [canvasRef, handleWheelEvent]);

  const onDragOver = useCallback((event: DragEvent<HTMLCanvasElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    const payload = getFileBrowserDragPayload(event.dataTransfer);
    const hasNativeFiles = event.dataTransfer.files.length > 0;
    if ((!payload || payload.type !== "file") && !hasNativeFiles) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLCanvasElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const position = screenToWorldPoint(
        {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        },
        viewportRef.current,
      );
      const payload = getFileBrowserDragPayload(event.dataTransfer);
      const openFileForDrop = async (filePath: string, fileName: string) => {
        const result = await openFileAsSectionForDrop({
          filePath,
          fileName,
          position,
          focusOnSection: false,
        });
        if (result.status === "unsupported_binary") {
          addTemporaryNotification(
            "Binary files cannot be auto-opened as sections from drag-and-drop.",
            NotificationTypeEnum.warning,
          );
          return;
        }
        if (result.status === "failed") {
          addTemporaryNotification(
            "Failed to create a section from the dropped file.",
            NotificationTypeEnum.error,
          );
        }
      };
      if (payload && payload.type === "file") {
        event.preventDefault();
        void openFileForDrop(payload.fullPath, payload.name);
        return;
      }
      const nativeFile = event.dataTransfer.files.item(0);
      if (!nativeFile) {
        return;
      }
      event.preventDefault();
      const openNativeFileDrop = async () => {
        const importResult = await importNativeFileToWorkspace(nativeFile);
        if (importResult.status !== "ok") {
          addTemporaryNotification(
            importResult.error,
            NotificationTypeEnum.error,
          );
          return;
        }
        await openFileForDrop(importResult.filePath, importResult.fileName);
      };
      void openNativeFileDrop();
    },
    [canvasRef, viewportRef],
  );

  return {
    onClick,
    onContextMenu,
    onDragOver,
    onDrop,
    onPointerDown,
    onPointerLeave,
    onPointerMove,
    onPointerUp,
  };
}

function getEdgeHitForEvent({
  canvas,
  edges,
  event,
  viewport,
}: {
  canvas: HTMLCanvasElement;
  edges: CanvasFlowDrawableEdge[];
  event: PointerEvent<HTMLCanvasElement> | MouseEvent<HTMLCanvasElement>;
  viewport: CanvasFlowViewport;
}): CanvasFlowEdgeHit | null {
  const rect = canvas.getBoundingClientRect();
  const point = screenToWorldPoint(
    {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    },
    viewport,
  );
  return getCanvasFlowEdgeHit({ edges, point, viewport });
}

function tryStartNestedDndPointerGesture({
  canEditLayout,
  event,
  gestureRef,
  suppressNextClickRef,
}: {
  canEditLayout: boolean;
  event: PointerEvent<HTMLCanvasElement>;
  gestureRef: MutableRefObject<PointerGesture | null>;
  suppressNextClickRef: MutableRefObject<boolean>;
}): boolean {
  const nestedDndGesture = getNestedDndGestureForPointerDown({
    canEditLayout,
    canvas: event.currentTarget,
    event,
  });
  if (!nestedDndGesture) {
    return false;
  }
  event.preventDefault();
  closeAllContextMenus();
  gestureRef.current = nestedDndGesture;
  event.currentTarget.setPointerCapture(event.pointerId);
  suppressNextClickRef.current = true;
  useReactFlow.setState({ viewportInteractionActive: true });
  return true;
}

function tryStartEdgePointerGesture({
  edges,
  event,
  gestureRef,
  suppressNextClickRef,
  viewport,
}: {
  edges: CanvasFlowDrawableEdge[];
  event: PointerEvent<HTMLCanvasElement>;
  gestureRef: MutableRefObject<PointerGesture | null>;
  suppressNextClickRef: MutableRefObject<boolean>;
  viewport: CanvasFlowViewport;
}): boolean {
  const edgeHit = getEdgeHitForEvent({
    canvas: event.currentTarget,
    edges,
    event,
    viewport,
  });
  if (!edgeHit || event.button !== 0) {
    return false;
  }
  event.preventDefault();
  closeAllContextMenus();
  return startEdgeHitGesture({
    edgeHit,
    event,
    gestureRef,
    suppressNextClickRef,
  });
}

function startEdgeHitGesture({
  edgeHit,
  event,
  gestureRef,
  suppressNextClickRef,
}: {
  edgeHit: CanvasFlowEdgeHit;
  event: PointerEvent<HTMLCanvasElement>;
  gestureRef: MutableRefObject<PointerGesture | null>;
  suppressNextClickRef: MutableRefObject<boolean>;
}): boolean {
  const reconnectTarget = edgeHit.endpoint
    ? getCanvasFlowReconnectTarget(edgeHit)
    : null;
  if (reconnectTarget) {
    startCanvasFlowEdgeReconnect({
      canvas: event.currentTarget,
      event,
      reconnectTarget,
    });
    gestureRef.current = {
      mode: "edge-reconnect",
      edgeHit,
      pointerId: event.pointerId,
      reconnectTarget,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressNextClickRef.current = true;
    return true;
  }
  gestureRef.current = {
    mode: "edge",
    edgeHit,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    moved: false,
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  return true;
}

function tryStartSelectionPointerGesture({
  event,
  gestureRef,
}: {
  event: PointerEvent<HTMLCanvasElement>;
  gestureRef: MutableRefObject<PointerGesture | null>;
}): boolean {
  if (!useReactFlow.getState().selectionKeyPressed || event.button !== 0) {
    return false;
  }
  const rect = getCanvasRelativePoint(event.currentTarget, event);
  applyActiveSectionChange(
    { interaction: "selection-rect", selectedIds: [] },
    { syncMode: "ui-only" },
  );
  useReactFlow.setState({
    userSelectionRect: {
      width: 0,
      height: 0,
      startX: rect.x,
      startY: rect.y,
      x: rect.x,
      y: rect.y,
    },
  });
  gestureRef.current = {
    mode: "select",
    pointerId: event.pointerId,
    startX: rect.x,
    startY: rect.y,
    moved: false,
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  return true;
}

function startPanPointerGesture({
  event,
  gestureRef,
}: {
  event: PointerEvent<HTMLCanvasElement>;
  gestureRef: MutableRefObject<PointerGesture | null>;
}) {
  event.preventDefault();
  closeAllContextMenus();
  useReactFlow.setState({
    paneDragging: true,
    viewportInteractionActive: true,
  });
  gestureRef.current = {
    mode: "pan",
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    lastClientX: event.clientX,
    lastClientY: event.clientY,
    moved: false,
  };
  event.currentTarget.setPointerCapture(event.pointerId);
}

function finishPointerGesture({
  event,
  finishViewportGesture,
  gesture,
  schedulePaint,
  suppressNextClickRef,
  viewport,
}: {
  event: PointerEvent<HTMLCanvasElement>;
  finishViewportGesture: () => void;
  gesture: PointerGesture;
  schedulePaint: () => void;
  suppressNextClickRef: MutableRefObject<boolean>;
  viewport: CanvasFlowViewport;
}) {
  switch (gesture.mode) {
    case "edge":
      finishEdgeGesture({ gesture, schedulePaint, suppressNextClickRef });
      return;
    case "edge-reconnect":
      suppressNextClickRef.current = true;
      finishEdgeReconnectGesture({
        canvas: event.currentTarget,
        event,
        gesture,
        schedulePaint,
        viewport,
      });
      return;
    case "nested-dnd":
      suppressNextClickRef.current = true;
      finishNestedDndGesture({
        canvas: event.currentTarget,
        event,
        gesture,
        schedulePaint,
        viewport,
      });
      return;
    case "pan":
      finishPanGesture({ event, finishViewportGesture, gesture, viewport });
      return;
    case "select":
      finishSelectionGesture();
  }
}

function finishEdgeGesture({
  gesture,
  schedulePaint,
  suppressNextClickRef,
}: {
  gesture: EdgePointerGesture;
  schedulePaint: () => void;
  suppressNextClickRef: MutableRefObject<boolean>;
}) {
  suppressNextClickRef.current = true;
  if (!gesture.moved) {
    toggleCanvasFlowEdgeSelection(gesture.edgeHit.edge);
    schedulePaint();
  }
}

function finishPanGesture({
  event,
  finishViewportGesture,
  gesture,
  viewport,
}: {
  event: PointerEvent<HTMLCanvasElement>;
  finishViewportGesture: () => void;
  gesture: PanPointerGesture;
  viewport: CanvasFlowViewport;
}) {
  finishViewportGesture();
  if (!gesture.moved && event.target === event.currentTarget) {
    onBackgroundClick(event, viewport, {
      forceDurableSync: true,
    });
  }
}

function finishSelectionGesture() {
  const activeCount = getActiveSectionUIIds().length;
  (
    useReactFlow.getState() as unknown as {
      setNodesSelection: (
        selectedNodesCount: number,
        ignoreGrid?: boolean,
      ) => void;
    }
  ).setNodesSelection(activeCount, true);
  setActiveSectionIds(getActiveSectionUIIds(), {
    forceDurableSync: true,
  });
  useReactFlow.setState({
    userSelectionActive: false,
    userSelectionRect: null,
  });
}

function updateEdgeGestureMove(
  gesture: EdgePointerGesture,
  event: PointerEvent<HTMLCanvasElement>,
) {
  gesture.moved =
    gesture.moved ||
    Math.hypot(
      event.clientX - gesture.startClientX,
      event.clientY - gesture.startClientY,
    ) > 3;
}

function getNestedDndGestureForPointerDown({
  canEditLayout,
  canvas,
  event,
}: {
  canEditLayout: boolean;
  canvas: HTMLCanvasElement;
  event: PointerEvent<HTMLCanvasElement>;
}): NestedDndPointerGesture | null {
  if (!canEditLayout || event.button !== 0 || !isNestedDndModeActive(event)) {
    return null;
  }
  const point = getClientPoint(event);
  const source = getCanvasFlowNestedDragSource({ point, root: canvas });
  if (!source) {
    return null;
  }
  return {
    mode: "nested-dnd",
    draggingRectsById: {
      [source.sectionId]: source.rect,
    },
    moved: false,
    pointerId: event.pointerId,
    sectionIds: [source.sectionId],
    sourceId: source.sectionId,
    startPoint: point,
  };
}

function updateNestedDndGestureMove(
  gesture: NestedDndPointerGesture,
  event: PointerEvent<HTMLCanvasElement>,
) {
  event.preventDefault();
  gesture.moved =
    gesture.moved ||
    Math.hypot(
      event.clientX - gesture.startPoint.x,
      event.clientY - gesture.startPoint.y,
    ) > 3;
}

function finishNestedDndGesture({
  canvas,
  event,
  gesture,
  schedulePaint,
  viewport,
}: {
  canvas: HTMLCanvasElement;
  event: PointerEvent<HTMLCanvasElement>;
  gesture: NestedDndPointerGesture;
  schedulePaint: () => void;
  viewport: CanvasFlowViewport;
}) {
  if (!gesture.moved) {
    useReactFlow.setState({ viewportInteractionActive: false });
    return;
  }
  const dragEndPoint = getClientPoint(event);
  const target = getCanvasFlowNestedDropTarget({
    point: dragEndPoint,
    root: canvas,
    sourceId: gesture.sourceId,
  });
  const canvasRect = canvas.getBoundingClientRect();
  const plan = resolveCanvasFlowNestedDndDropPlan({
    dragEndPoint,
    dragStartPoint: gesture.startPoint,
    draggingRectsById: gesture.draggingRectsById,
    sectionIds: gesture.sectionIds,
    target,
    toWorldPosition: (position) =>
      screenToWorldPoint(
        {
          x: position.x - canvasRect.left,
          y: position.y - canvasRect.top,
        },
        viewport,
      ),
  });
  if (plan) {
    moveSectionsWithBackend(plan);
  }
  manualDndChildrenReset();
  useReactFlow.setState({ viewportInteractionActive: false });
  schedulePaint();
}

function isNestedDndModeActive(
  event: PointerEvent<HTMLCanvasElement>,
): boolean {
  const dndState = useDndState.getState();
  return dndState.isMovingFree || dndState.isSorting || event.altKey;
}

function getClientPoint(event: PointerEvent<HTMLCanvasElement>) {
  return {
    x: event.clientX,
    y: event.clientY,
  };
}

function updatePanGestureMove({
  commitViewportChange,
  event,
  gesture,
  viewportRef,
}: {
  commitViewportChange: () => void;
  event: PointerEvent<HTMLCanvasElement>;
  gesture: PanPointerGesture;
  viewportRef: MutableRefObject<CanvasFlowViewport>;
}) {
  const delta = {
    x: event.clientX - gesture.lastClientX,
    y: event.clientY - gesture.lastClientY,
  };
  const totalDelta = Math.hypot(
    event.clientX - gesture.startClientX,
    event.clientY - gesture.startClientY,
  );
  gesture.lastClientX = event.clientX;
  gesture.lastClientY = event.clientY;
  gesture.moved = gesture.moved || totalDelta > 2;
  viewportRef.current = panViewportByScreenDelta(viewportRef.current, delta);
  commitViewportChange();
}

function updateSelectionGestureMove({
  event,
  gesture,
  viewport,
}: {
  event: PointerEvent<HTMLCanvasElement>;
  gesture: SelectPointerGesture;
  viewport: CanvasFlowViewport;
}) {
  const rect = getCanvasRelativePoint(event.currentTarget, event);
  const nextRect = {
    x: rect.x < gesture.startX ? rect.x : gesture.startX,
    y: rect.y < gesture.startY ? rect.y : gesture.startY,
    width: Math.abs(rect.x - gesture.startX),
    height: Math.abs(rect.y - gesture.startY),
    startX: gesture.startX,
    startY: gesture.startY,
  };
  gesture.moved = nextRect.width > 2 || nextRect.height > 2;
  const selectedNodeIds = getNodesInside(
    nextRect,
    canvasFlowViewportToTransform(viewport),
    useSettings.getState().gui.selectionMode === SelectionModeEnum.partial,
  );
  applyActiveSectionChange(
    {
      interaction: "selection-rect",
      selectedIds: selectedNodeIds,
    },
    { syncMode: "ui-only" },
  );
  useReactFlow.setState({
    userSelectionActive: true,
    userSelectionRect: nextRect,
    nodesSelectionDims: null,
  });
}

function toggleCanvasFlowEdgeSelection(edge: CanvasFlowDrawableEdge) {
  const multiSelect = useReactFlow.getState().multiSelectionActive;
  if (edge.kind === "data") {
    toggleEdgeSelection(edge.id, multiSelect);
    return;
  }
  if (edge.kind === "agentic") {
    toggleAgenticEdgeSelection(edge.id, multiSelect);
    return;
  }
  if (edge.kind === "state-machine") {
    toggleStateMachineEdgeSelection(edge.id, multiSelect);
  }
}

function shouldPanCanvasFlowWheel({
  event,
  panOnScroll,
  zoomActivationKeyPressed,
  zoomOnPinch,
  zoomOnScroll,
}: {
  event: WheelEvent;
  panOnScroll: boolean;
  zoomActivationKeyPressed: boolean;
  zoomOnPinch: boolean;
  zoomOnScroll: boolean;
}) {
  return (
    panOnScroll &&
    !zoomActivationKeyPressed &&
    !zoomOnScroll &&
    !(event.ctrlKey && zoomOnPinch && isMacOs())
  );
}

export function panCanvasFlowByWheel({
  commitViewportChange,
  event,
  panOnScrollMode,
  panOnScrollSpeed,
  viewportRef,
}: {
  commitViewportChange: () => void;
  event: WheelEvent;
  panOnScrollMode: PanOnScrollMode;
  panOnScrollSpeed: number;
  viewportRef: MutableRefObject<CanvasFlowViewport>;
}) {
  const delta = resolvePanOnScrollDelta({
    event,
    panOnScrollMode,
  });
  viewportRef.current = panViewportByScreenDelta(viewportRef.current, {
    x: -delta.x * panOnScrollSpeed,
    y: -delta.y * panOnScrollSpeed,
  });
  commitViewportChange();
}

function zoomCanvasFlowByWheel({
  canvas,
  commitViewportChange,
  event,
  maxZoom,
  minZoom,
  viewportRef,
}: {
  canvas: HTMLCanvasElement | null;
  commitViewportChange: () => void;
  event: WheelEvent;
  maxZoom: number;
  minZoom: number;
  viewportRef: MutableRefObject<CanvasFlowViewport>;
}) {
  const rect = canvas?.getBoundingClientRect();
  if (!rect) {
    return false;
  }
  const point = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
  const wheelFactor = event.ctrlKey && isMacOs() ? 10 : 1;
  const delta = getWheelDelta(event, wheelFactor);
  const nextZoom = clampZoom(
    viewportRef.current.zoom * Math.pow(2, delta),
    minZoom,
    maxZoom,
  );
  viewportRef.current = zoomViewportAroundScreenPoint({
    viewport: viewportRef.current,
    screenPoint: point,
    nextZoom,
  });
  commitViewportChange();
  return true;
}

function startCanvasFlowEdgeReconnect({
  canvas,
  event,
  reconnectTarget,
}: {
  canvas: HTMLCanvasElement;
  event: PointerEvent<HTMLCanvasElement>;
  reconnectTarget: CanvasFlowReconnectTarget;
}) {
  useReactFlow.setState({
    connectionEndHandle: null,
    connectionPosition: getCanvasRelativePoint(canvas, event),
    connectionStartHandle: {
      sectionId: reconnectTarget.nodeId,
      handleId: reconnectTarget.handleId,
      type: reconnectTarget.handleType,
    },
    connectionStatus: null,
  });
}

function updateEdgeReconnectGestureMove({
  canvas,
  event,
  gesture,
  viewport,
}: {
  canvas: HTMLCanvasElement;
  event: PointerEvent<HTMLCanvasElement>;
  gesture: EdgeReconnectPointerGesture;
  viewport: CanvasFlowViewport;
}) {
  const closest = getClosestCanvasFlowReconnectHandle({
    canvas,
    event,
    reconnectTarget: gesture.reconnectTarget,
    viewport,
  });
  useReactFlow.setState({
    connectionEndHandle: closest
      ? {
          sectionId: closest.sectionId,
          handleId: closest.handleId,
          type: closest.type,
        }
      : null,
    connectionPosition: getCanvasRelativePoint(canvas, event),
    connectionStatus: closest ? "valid" : null,
  });
}

function finishEdgeReconnectGesture({
  canvas,
  event,
  gesture,
  schedulePaint,
  viewport,
}: {
  canvas: HTMLCanvasElement;
  event: PointerEvent<HTMLCanvasElement>;
  gesture: EdgeReconnectPointerGesture;
  schedulePaint: () => void;
  viewport: CanvasFlowViewport;
}) {
  const closest = getClosestCanvasFlowReconnectHandle({
    canvas,
    event,
    reconnectTarget: gesture.reconnectTarget,
    viewport,
  });
  if (closest) {
    const connection = buildCanvasFlowReconnectConnection({
      closest,
      reconnectTarget: gesture.reconnectTarget,
    });
    if (isValidDataEdgeConnection(connection)) {
      reconnectEdgeFromConnection(gesture.edgeHit.edge.id, connection);
    }
  }
  cancelCanvasFlowConnection();
  schedulePaint();
}

function getClosestCanvasFlowReconnectHandle({
  canvas,
  event,
  reconnectTarget,
  viewport,
}: {
  canvas: HTMLCanvasElement;
  event: PointerEvent<HTMLCanvasElement>;
  reconnectTarget: CanvasFlowReconnectTarget;
  viewport: CanvasFlowViewport;
}): {
  handleId: string | null;
  sectionId: string;
  type: HandleType;
} | null {
  const position = screenToWorldPoint(
    getCanvasRelativePoint(canvas, event),
    viewport,
  );
  const tolerance =
    useReactFlow.getState().connectionRadius / Math.max(viewport.zoom, 0.001);
  let closest: {
    distance: number;
    handleId: string | null;
    sectionId: string;
    type: HandleType;
  } | null = null;
  for (const handle of Object.values(
    useEdgeHandleRegistry.getState().positions,
  )) {
    if (!isReconnectHandleCandidate(handle, reconnectTarget)) {
      continue;
    }
    const distance = Math.hypot(handle.x - position.x, handle.y - position.y);
    if (!isCloserReconnectHandle(distance, tolerance, closest?.distance)) {
      continue;
    }
    closest = {
      distance,
      handleId: handle.portId,
      sectionId: handle.sectionId,
      type: handle.type,
    };
  }
  if (!closest) {
    return null;
  }
  return {
    handleId: closest.handleId,
    sectionId: closest.sectionId,
    type: closest.type,
  };
}

function isReconnectHandleCandidate(
  handle: CanvasFlowHandlePosition,
  reconnectTarget: CanvasFlowReconnectTarget,
) {
  if (handle.type === reconnectTarget.handleType) {
    return false;
  }
  if (
    handle.sectionId === reconnectTarget.nodeId &&
    handle.portId === reconnectTarget.handleId
  ) {
    return false;
  }
  return isValidDataEdgeConnection(
    buildCanvasFlowReconnectConnection({
      closest: {
        handleId: handle.portId,
        sectionId: handle.sectionId,
        type: handle.type,
      },
      reconnectTarget,
    }),
  );
}

function isCloserReconnectHandle(
  distance: number,
  tolerance: number,
  closestDistance: number | undefined,
) {
  return (
    distance <= tolerance &&
    (closestDistance === undefined || distance < closestDistance)
  );
}

function buildCanvasFlowReconnectConnection({
  closest,
  reconnectTarget,
}: {
  closest: { handleId: string | null; sectionId: string; type: HandleType };
  reconnectTarget: CanvasFlowReconnectTarget;
}): Connection {
  if (reconnectTarget.handleType === "source") {
    return {
      source: reconnectTarget.nodeId,
      sourceHandle: reconnectTarget.handleId,
      target: closest.sectionId,
      targetHandle: closest.handleId,
    };
  }
  return {
    source: closest.sectionId,
    sourceHandle: closest.handleId,
    target: reconnectTarget.nodeId,
    targetHandle: reconnectTarget.handleId,
  };
}

function cancelCanvasFlowConnection() {
  useReactFlow.getState().cancelConnection();
}

function getCanvasFlowReconnectTarget(
  edgeHit: CanvasFlowEdgeHit,
): CanvasFlowReconnectTarget | null {
  const edge = edgeHit.edge;
  if (edge.kind !== "data" || !edgeHit.endpoint) {
    return null;
  }
  if (
    !edge.sourceSectionId ||
    !edge.sourceHandleId ||
    !edge.targetSectionId ||
    !edge.targetHandleId
  ) {
    return null;
  }
  if (edgeHit.endpoint === "source") {
    return {
      nodeId: edge.targetSectionId,
      handleId: edge.targetHandleId,
      handleType: "target",
      isTarget: true,
    };
  }
  return {
    nodeId: edge.sourceSectionId,
    handleId: edge.sourceHandleId,
    handleType: "source",
    isTarget: false,
  };
}

function isPanButtonAllowed(button: number, panOnDrag: boolean | number[]) {
  if (button === 0 || button === 1) {
    return true;
  }
  if (!panOnDrag) {
    return false;
  }
  if (Array.isArray(panOnDrag)) {
    return panOnDrag.includes(button);
  }
  return button <= 1;
}

function onBackgroundClick(
  event: { clientX: number; clientY: number; currentTarget: HTMLCanvasElement },
  viewport: CanvasFlowViewport,
  options?: SetActiveSectionIdsOptions,
) {
  const rect = event.currentTarget.getBoundingClientRect();
  applyActiveSectionChange({ interaction: "pane-click" }, options);
  useMisc.setState({
    lastPaneClickLocation: screenToWorldPoint(
      {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      },
      viewport,
    ),
  });
  useReactFlow.setState({ nodesSelectionDims: null });
}

function dispatchCanvasFlowViewportChange(viewport: CanvasFlowViewport) {
  publishCanvasFlowLiveViewport(viewport);
}

function recordCanvasFlowInteractionMetric(
  canvas: HTMLCanvasElement | null,
  key: string,
) {
  if (!canvas) {
    return;
  }
  const currentValue = Number.parseInt(canvas.dataset[key] ?? "0", 10);
  canvas.dataset[key] = String(
    Number.isFinite(currentValue) ? currentValue + 1 : 1,
  );
}

function shouldIgnoreWheelEvent({
  ctrlKey,
  target,
  zoomActivationKeyPressed,
  zoomOnPinch,
}: {
  ctrlKey: boolean;
  target: EventTarget | null;
  zoomActivationKeyPressed: boolean;
  zoomOnPinch: boolean;
}) {
  if (!(target instanceof Element)) {
    return false;
  }
  if (!target.closest(`.${NO_WHEEL_CLASS_NAME}`)) {
    return false;
  }
  if (zoomActivationKeyPressed) {
    return false;
  }
  return !(ctrlKey && zoomOnPinch && isMacOs());
}

function resolvePanOnScrollDelta({
  event,
  panOnScrollMode,
}: {
  event: WheelEvent;
  panOnScrollMode: PanOnScrollMode;
}) {
  const deltaNormalize = event.deltaMode === 1 ? 20 : 1;
  let x =
    panOnScrollMode === PanOnScrollModeEnum.vertical
      ? 0
      : event.deltaX * deltaNormalize;
  let y =
    panOnScrollMode === PanOnScrollModeEnum.horizontal
      ? 0
      : event.deltaY * deltaNormalize;
  if (
    !isMacOs() &&
    event.shiftKey &&
    panOnScrollMode !== PanOnScrollModeEnum.vertical
  ) {
    x = event.deltaY * deltaNormalize;
    y = 0;
  }
  return { x, y };
}

type PanOnScrollMode =
  (typeof PanOnScrollModeEnum)[keyof typeof PanOnScrollModeEnum];

function getCanvasRelativePoint(
  canvas: HTMLCanvasElement,
  event: PointerEvent<HTMLCanvasElement>,
) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}
