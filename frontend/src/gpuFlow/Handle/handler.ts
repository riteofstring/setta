import type {
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
} from "react";

import { canConnectHandleFamilies } from "state/actions/chatSharedHandleIds";
import { recomputeEdgeHandlePositions } from "state/actions/edgeHandles";
import { useEdgeHandleRegistry, useLocalStorage } from "state/definitions";
import type { Connection, HandleType } from "../flowTypes";
import { GPU_FLOW_CLASS_NAMES } from "../gpuFlowDomClasses";
import { getGpuNodeDragAutoPanDelta } from "../interactions/nodeDrag";
import { panGpuViewport } from "../viewportActions";
import {
  flowToScreenPosition,
  screenToFlowPosition,
  type GpuPoint,
} from "../viewportMath";
import type {
  GpuConnectionState,
  GpuFlowViewportStoreApi,
} from "../viewportStore";
import {
  getClosestHandle,
  getConnectionStatus,
  getHandleLookup,
  getHandleType,
  isValidHandle,
  resetRecentHandle,
  type ConnectionHandle,
  type ValidConnectionFunc,
} from "./utils";

type HandlePointerEvent = ReactMouseEvent | ReactTouchEvent;
type NativeHandlePointerEvent = MouseEvent | TouchEvent;

export function handlePointerDown({
  event,
  handleId,
  nodeId,
  onConnect,
  isTarget,
  store,
  isValidConnection,
  edgeUpdaterType,
  onReconnectEnd,
}: {
  event: HandlePointerEvent;
  handleId: string | null;
  nodeId: string;
  onConnect: (connection: Connection) => void;
  isTarget: boolean;
  store: GpuFlowViewportStoreApi;
  isValidConnection: ValidConnectionFunc;
  edgeUpdaterType?: HandleType;
  onReconnectEnd?: (evt: MouseEvent | TouchEvent) => void;
}): void {
  const doc = getHostForElement(event.target as HTMLElement);
  const { connectionMode, domNode, autoPanOnConnect, connectionRadius } =
    store.getState();
  let autoPanId = 0;
  let closestHandle: ConnectionHandle | null = null;

  const { x, y } = getEventPosition(event);
  const clickedHandle = doc.elementFromPoint(x, y);
  const handleType = getHandleType(edgeUpdaterType, clickedHandle);
  const containerBounds = domNode?.getBoundingClientRect();

  if (!containerBounds || !handleType) {
    return;
  }

  recomputeEdgeHandlePositions();

  let prevActiveHandle: Element | null = null;
  let connectionPosition = getEventPosition(event, containerBounds);
  let autoPanStarted = false;
  let connection: Connection | null = null;
  let isValid = false;
  let handleDomNode: Element | null = null;
  let connectionGestureCleanedUp = false;

  const handlePositions = Object.values(
    useEdgeHandleRegistry.getState().positions,
  ).map((handle) => ({
    sectionId: handle.sectionId,
    portId: handle.portId,
    type: handle.type,
    x: handle.x,
    y: handle.y,
  }));

  const handleLookup = getHandleLookup(
    handlePositions,
    `${nodeId}-${handleId}-${handleType}`,
  );
  const fromType: HandleType = isTarget ? "target" : "source";
  const validateHandle = (
    handle: Pick<ConnectionHandle, "sectionId" | "portId" | "type">,
  ) =>
    isValidHandle({
      handle,
      connectionMode,
      from: {
        sectionId: nodeId,
        handleId,
        type: fromType,
      },
      isValidConnection,
      doc,
    });
  const shouldFilterByAgentic = handleId !== null;
  const allowHandle = shouldFilterByAgentic
    ? (handle: Pick<ConnectionHandle, "portId" | "type">) => {
        return canConnectHandleFamilies(handleId, handle.portId);
      }
    : null;

  const getClosestHandleForEvent = ({
    event,
    position,
    radius,
  }: {
    event: NativeHandlePointerEvent;
    position: GpuPoint;
    radius: number;
  }) =>
    getClosestHandle({
      event,
      doc,
      pos: screenToFlowPosition(position, store.getState().transform),
      connectionRadius: radius,
      handles: handleLookup,
      allowHandle,
      validator: validateHandle,
    });

  const autoPan = (): void => {
    if (!autoPanOnConnect) {
      return;
    }
    const { overviewTrueWidth, uiEditorTrueWidth } = useLocalStorage.getState();
    const delta = getGpuNodeDragAutoPanDelta({
      insetsPx: {
        left: overviewTrueWidth,
        right: uiEditorTrueWidth,
      },
      point: connectionPosition,
      viewportSize: {
        height: containerBounds.height,
        width: containerBounds.width,
      },
    });

    panGpuViewport(delta, { store });
    autoPanId = requestAnimationFrame(autoPan);
  };

  const setConnectionPreview = ({
    nextClosestHandle,
    nextIsValid,
    endHandle,
  }: {
    nextClosestHandle: ConnectionHandle | null;
    nextIsValid: boolean;
    endHandle: GpuConnectionState["connectionEndHandle"];
  }) => {
    const nextConnectionPosition =
      nextClosestHandle && nextIsValid
        ? flowToScreenPosition(
            {
              x: nextClosestHandle.x,
              y: nextClosestHandle.y,
            },
            store.getState().transform,
          )
        : connectionPosition;

    store.getState().setConnectionState({
      connectionPosition: nextConnectionPosition,
      connectionStatus: getConnectionStatus(!!nextClosestHandle, nextIsValid),
      connectionEndHandle: endHandle,
    });
  };

  const updateActiveHandlePreview = ({
    nextClosestHandle,
    nextIsValid,
    nextConnection,
    nextHandleDomNode,
  }: {
    nextClosestHandle: ConnectionHandle | null;
    nextIsValid: boolean;
    nextConnection: Connection | null;
    nextHandleDomNode: Element | null;
  }) => {
    if (!nextClosestHandle && !nextIsValid && !nextHandleDomNode) {
      resetRecentHandle(prevActiveHandle);
      return;
    }

    if (
      nextConnection?.source === nextConnection?.target ||
      !nextHandleDomNode
    ) {
      return;
    }

    resetRecentHandle(prevActiveHandle);
    prevActiveHandle = nextHandleDomNode;
    nextHandleDomNode.classList.add(
      "connecting",
      GPU_FLOW_CLASS_NAMES.handleConnecting,
    );
    nextHandleDomNode.classList.toggle("valid", nextIsValid);
    nextHandleDomNode.classList.toggle(
      GPU_FLOW_CLASS_NAMES.handleValid,
      nextIsValid,
    );
  };

  const resolvePointerUpState = (
    event: NativeHandlePointerEvent,
  ): {
    closestHandle: ConnectionHandle | null;
    connection: Connection | null;
    isValid: boolean;
  } => {
    if (closestHandle || !handleId?.includes("reverse")) {
      return {
        closestHandle,
        connection,
        isValid,
      };
    }

    const fallback = getClosestHandleForEvent({
      event,
      position: getEventPosition(event, containerBounds),
      radius: Math.max(connectionRadius, 80),
    });

    return {
      closestHandle: fallback.handle,
      connection: fallback.validHandleResult.connection,
      isValid: fallback.validHandleResult.isValid,
    };
  };

  store.getState().setConnectionState({
    connectionPosition,
    connectionStatus: null,
    connectionStartHandle: {
      sectionId: nodeId,
      handleId,
      type: handleType,
    },
    connectionEndHandle: null,
  });

  function onPointerMove(event: NativeHandlePointerEvent) {
    connectionPosition = getEventPosition(event, containerBounds);

    const { handle, validHandleResult } = getClosestHandleForEvent({
      event,
      position: connectionPosition,
      radius: connectionRadius,
    });

    closestHandle = handle;

    if (!autoPanStarted) {
      autoPan();
      autoPanStarted = true;
    }

    handleDomNode = validHandleResult.handleDomNode;
    connection = validHandleResult.connection;
    isValid = validHandleResult.isValid;

    setConnectionPreview({
      nextClosestHandle: closestHandle,
      nextIsValid: isValid,
      endHandle: validHandleResult.endHandle
        ? {
            sectionId: validHandleResult.endHandle.sectionId,
            handleId: validHandleResult.endHandle.handleId,
            type: validHandleResult.endHandle.type,
          }
        : null,
    });
    updateActiveHandlePreview({
      nextClosestHandle: closestHandle,
      nextIsValid: isValid,
      nextConnection: connection,
      nextHandleDomNode: handleDomNode,
    });
  }

  function cleanupConnectionGesture() {
    if (connectionGestureCleanedUp) {
      return;
    }
    connectionGestureCleanedUp = true;

    resetRecentHandle(prevActiveHandle);
    store.getState().cancelConnection();
    cancelAnimationFrame(autoPanId);
    autoPanStarted = false;
    isValid = false;
    connection = null;
    handleDomNode = null;

    doc.removeEventListener("mousemove", onPointerMove as EventListener);
    doc.removeEventListener("mouseup", onPointerUp as EventListener);

    doc.removeEventListener("touchmove", onPointerMove as EventListener);
    doc.removeEventListener("touchend", onPointerUp as EventListener);
    doc.removeEventListener("touchcancel", onConnectionCancel as EventListener);

    doc.removeEventListener("pointercancel", onConnectionCancel, true);
    doc.removeEventListener("keydown", onKeyDown as EventListener, true);
  }

  function onConnectionCancel(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    cleanupConnectionGesture();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") {
      return;
    }
    onConnectionCancel(event);
  }

  function onPointerUp(event: NativeHandlePointerEvent) {
    const {
      closestHandle: resolvedClosestHandle,
      connection: resolvedConnection,
      isValid: resolvedIsValid,
    } = resolvePointerUpState(event);

    if (
      (resolvedClosestHandle || handleDomNode) &&
      resolvedConnection &&
      resolvedIsValid
    ) {
      onConnect?.(resolvedConnection);
    }

    if (edgeUpdaterType) {
      onReconnectEnd?.(event);
    }

    cleanupConnectionGesture();
  }

  doc.addEventListener("mousemove", onPointerMove as EventListener);
  doc.addEventListener("mouseup", onPointerUp as EventListener);

  doc.addEventListener("touchmove", onPointerMove as EventListener);
  doc.addEventListener("touchend", onPointerUp as EventListener);
  doc.addEventListener("touchcancel", onConnectionCancel as EventListener);

  doc.addEventListener("pointercancel", onConnectionCancel, true);
  doc.addEventListener("keydown", onKeyDown as EventListener, true);
}

function getEventPosition(
  event: HandlePointerEvent | NativeHandlePointerEvent,
  bounds?: DOMRect,
): GpuPoint {
  const point = getClientPoint(event);
  return {
    x: point.x - (bounds?.left ?? 0),
    y: point.y - (bounds?.top ?? 0),
  };
}

function getClientPoint(
  event: HandlePointerEvent | NativeHandlePointerEvent,
): GpuPoint {
  if ("clientX" in event) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }
  const touch = event.touches[0] ?? event.changedTouches[0];
  return {
    x: touch?.clientX ?? 0,
    y: touch?.clientY ?? 0,
  };
}

function getHostForElement(element: HTMLElement): Document | ShadowRoot {
  return (element.getRootNode?.() as Document | ShadowRoot) || window.document;
}
