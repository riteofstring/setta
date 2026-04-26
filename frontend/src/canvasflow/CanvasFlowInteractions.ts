import { useReactFlow } from "forks/xyflow/core/store";
import { getWheelDelta } from "forks/xyflow/core/utils";
import { getNodesInside } from "forks/xyflow/core/utils/graph";
import {
  useCallback,
  useRef,
  type DragEvent,
  type MouseEvent,
  type MutableRefObject,
  type PointerEvent,
  type WheelEvent as ReactWheelEvent,
  type RefObject,
} from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import {
  setActiveSectionIds,
  type SetActiveSectionIdsOptions,
} from "state/actions/activeSections";
import {
  closeAllContextMenus,
  openPaneContextMenu,
} from "state/actions/contextMenus";
import { addTemporaryNotification } from "state/actions/notifications";
import { openFileAsSectionForDrop } from "state/actions/sections/createSections";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import { useMisc, useSettings } from "state/definitions";
import { NO_WHEEL_CLASS_NAME } from "utils/constants";
import { getFileBrowserDragPayload } from "utils/fileBrowserDragPayload";
import {
  NotificationTypeEnum,
  PanOnScrollModeEnum,
  SelectionModeEnum,
} from "utils/generatedTypes";
import { importNativeFileToWorkspace } from "utils/nativeFileImport";
import { isMacOs } from "utils/utils";
import type { CanvasFlowViewport } from "./canvasFlowTypes";
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
  onWheel: (event: ReactWheelEvent<HTMLCanvasElement>) => void;
};

type UseCanvasFlowInteractionsParams = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
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
    };

export function useCanvasFlowInteractions({
  canvasRef,
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
      if (Array.isArray(panOnDrag) && panOnDrag.includes(2)) {
        event.preventDefault();
        return;
      }
      openPaneContextMenu(event);
    },
    [panOnDrag],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      syncStoreViewport();
      if (event.target !== event.currentTarget) {
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
    [panOnDrag, syncStoreViewport],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) {
        return;
      }
      if (gesture.mode === "pan") {
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
        viewportRef.current = panViewportByScreenDelta(
          viewportRef.current,
          delta,
        );
        commitViewportChange();
        return;
      }
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
        canvasFlowViewportToTransform(viewportRef.current),
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
    [finishViewportGesture, viewportRef],
  );

  const onPointerLeave = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (!gestureRef.current) {
        return;
      }
      onPointerUp(event);
    },
    [onPointerUp],
  );

  const onWheel = useCallback(
    (event: ReactWheelEvent<HTMLCanvasElement>) => {
      if (
        shouldIgnoreWheelEvent({
          event,
          zoomActivationKeyPressed,
          zoomOnPinch,
        })
      ) {
        return;
      }
      const nativeEvent = event.nativeEvent;
      const isPinch = nativeEvent.ctrlKey && zoomOnPinch && isMacOs();
      const shouldPan =
        panOnScroll && !zoomActivationKeyPressed && !zoomOnScroll && !isPinch;
      event.preventDefault();
      if (shouldPan) {
        const delta = resolvePanOnScrollDelta({
          event: nativeEvent,
          panOnScrollMode,
        });
        viewportRef.current = panViewportByScreenDelta(viewportRef.current, {
          x: -(delta.x / viewportRef.current.zoom) * panOnScrollSpeed,
          y: -(delta.y / viewportRef.current.zoom) * panOnScrollSpeed,
        });
        startWheelInteraction("pan");
        commitViewportChange();
        return;
      }
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const point = {
        x: nativeEvent.clientX - rect.left,
        y: nativeEvent.clientY - rect.top,
      };
      const wheelFactor = nativeEvent.ctrlKey && isMacOs() ? 10 : 1;
      const delta = getWheelDelta(nativeEvent, wheelFactor);
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
      startWheelInteraction("zoom");
      commitViewportChange();
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
    onWheel,
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

function shouldIgnoreWheelEvent({
  event,
  zoomActivationKeyPressed,
  zoomOnPinch,
}: {
  event: ReactWheelEvent<HTMLCanvasElement>;
  zoomActivationKeyPressed: boolean;
  zoomOnPinch: boolean;
}) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  if (!target.closest(`.${NO_WHEEL_CLASS_NAME}`)) {
    return false;
  }
  if (zoomActivationKeyPressed) {
    return false;
  }
  return !(event.ctrlKey && zoomOnPinch && isMacOs());
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
