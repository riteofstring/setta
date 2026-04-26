import { handlePointerDown } from "forks/xyflow/core/components/Handle/handler";
import { useReactFlow } from "forks/xyflow/core/store";
import type { HandleType } from "forks/xyflow/core/types";
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
  reconnectEdgeFromConnection,
  toggleEdgeSelection,
} from "state/actions/edges";
import { addTemporaryNotification } from "state/actions/notifications";
import { openFileAsSectionForDrop } from "state/actions/sections/createSections";
import { toggleStateMachineEdgeSelection } from "state/actions/stateMachineEdges";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import { useMisc, useSettings } from "state/definitions";
import {
  CANVAS_FLOW_VIEWPORT_CHANGE_EVENT,
  NO_WHEEL_CLASS_NAME,
} from "utils/constants";
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
import type {
  CanvasFlowDrawableEdge,
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
    };
type EdgePointerGesture = Extract<PointerGesture, { mode: "edge" }>;
type PanPointerGesture = Extract<PointerGesture, { mode: "pan" }>;
type SelectPointerGesture = Extract<PointerGesture, { mode: "select" }>;

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

  const syncStoreViewport = useCallback(() => {
    const viewport = viewportRef.current;
    useReactFlow.setState({
      transform: canvasFlowViewportToTransform(viewport),
    });
  }, [viewportRef]);

  const scheduleStoreViewportSync = useCallback(() => {
    clearTimeout(storeSyncTimeoutRef.current);
    storeSyncTimeoutRef.current = setTimeout(syncStoreViewport, 120);
  }, [syncStoreViewport]);

  const commitViewportChange = useCallback(() => {
    dispatchCanvasFlowViewportChange();
    schedulePaint();
    scheduleStoreViewportSync();
  }, [schedulePaint, scheduleStoreViewportSync]);

  const finishViewportGesture = useCallback(() => {
    clearTimeout(storeSyncTimeoutRef.current);
    syncStoreViewport();
    useReactFlow.setState({
      paneDragging: false,
      viewportInteractionActive: false,
    });
    useMisc.setState({ isPanScrolling: false });
    dispatchCanvasFlowViewportChange();
  }, [syncStoreViewport]);

  const startWheelInteraction = useCallback((kind: "pan" | "zoom") => {
    useReactFlow.setState({ viewportInteractionActive: true });
    if (kind === "pan") {
      useMisc.setState({ isPanScrolling: true });
      clearTimeout(panScrollTimeoutRef.current);
      panScrollTimeoutRef.current = setTimeout(() => {
        useMisc.setState({ isPanScrolling: false });
        useReactFlow.setState({ viewportInteractionActive: false });
      }, 150);
      return;
    }
    clearTimeout(wheelZoomTimeoutRef.current);
    wheelZoomTimeoutRef.current = setTimeout(() => {
      useReactFlow.setState({ viewportInteractionActive: false });
    }, 180);
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
      onBackgroundClick(event, viewportRef.current, { forceDurableSync: true });
    },
    [viewportRef],
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
      const edgeHit = getEdgeHitForEvent({
        canvas: event.currentTarget,
        edges: edgesRef.current,
        event,
        viewport: viewportRef.current,
      });
      if (edgeHit && event.button === 0) {
        event.preventDefault();
        closeAllContextMenus();
        if (
          edgeHit.endpoint &&
          startCanvasFlowEdgeReconnect({
            event,
            edgeHit,
            schedulePaint,
          })
        ) {
          suppressNextClickRef.current = true;
          return;
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
        return;
      }
      if (useReactFlow.getState().selectionKeyPressed && event.button === 0) {
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
        return;
      }
      if (!isPanButtonAllowed(event.button, panOnDrag)) {
        return;
      }
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
    },
    [edgesRef, panOnDrag, schedulePaint, syncStoreViewport, viewportRef],
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
      if (gesture.mode === "edge") {
        suppressNextClickRef.current = true;
        if (!gesture.moved) {
          toggleCanvasFlowEdgeSelection(gesture.edgeHit.edge);
          schedulePaint();
        }
        return;
      }
      if (gesture.mode === "pan") {
        finishViewportGesture();
        if (!gesture.moved && event.target === event.currentTarget) {
          onBackgroundClick(event, viewportRef.current, {
            forceDurableSync: true,
          });
        }
        return;
      }
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
        panCanvasFlowByWheel({
          commitViewportChange,
          event,
          panOnScrollMode,
          panOnScrollSpeed,
          viewportRef,
        });
        startWheelInteraction("pan");
        return;
      }
      if (
        zoomCanvasFlowByWheel({
          canvas: canvasRef.current,
          commitViewportChange,
          event,
          maxZoom,
          minZoom,
          viewportRef,
        })
      ) {
        startWheelInteraction("zoom");
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

function panCanvasFlowByWheel({
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
    x: -(delta.x / viewportRef.current.zoom) * panOnScrollSpeed,
    y: -(delta.y / viewportRef.current.zoom) * panOnScrollSpeed,
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
  edgeHit,
  event,
  schedulePaint,
}: {
  edgeHit: CanvasFlowEdgeHit;
  event: PointerEvent<HTMLCanvasElement>;
  schedulePaint: () => void;
}): boolean {
  const reconnectTarget = getCanvasFlowReconnectTarget(edgeHit);
  if (!reconnectTarget) {
    return false;
  }
  handlePointerDown({
    event: event as unknown as Parameters<typeof handlePointerDown>[0]["event"],
    handleId: reconnectTarget.handleId,
    nodeId: reconnectTarget.nodeId,
    onConnect: (connection) => {
      reconnectEdgeFromConnection(edgeHit.edge.id, connection);
      schedulePaint();
    },
    isTarget: reconnectTarget.isTarget,
    getState: useReactFlow.getState,
    setState: useReactFlow.setState,
    isValidConnection: () => true,
    edgeUpdaterType: reconnectTarget.handleType,
    onReconnectEnd: schedulePaint,
  });
  return true;
}

function getCanvasFlowReconnectTarget(edgeHit: CanvasFlowEdgeHit): {
  handleId: string | null;
  handleType: HandleType;
  isTarget: boolean;
  nodeId: string;
} | null {
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

function dispatchCanvasFlowViewportChange() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(CANVAS_FLOW_VIEWPORT_CHANGE_EVENT));
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
