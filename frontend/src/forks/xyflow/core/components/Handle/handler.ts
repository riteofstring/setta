import type {
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import type { StoreApi } from "zustand";

import { canConnectHandleFamilies } from "state/actions/chatSharedHandleIds";
import { recomputeEdgeHandlePositions } from "state/actions/edgeHandles";
import { useEdgeHandleRegistry } from "state/definitions";
import type { Connection, HandleType, ReactFlowState } from "../../types";
import { calcAutoPan, getEventPosition, getHostForElement } from "../../utils";
import { pointToRendererPoint, rendererPointToPoint } from "../../utils/graph";
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

export function handlePointerDown({
  event,
  handleId,
  nodeId,
  onConnect,
  isTarget,
  getState,
  setState,
  isValidConnection,
  edgeUpdaterType,
  onReconnectEnd,
}: {
  event: ReactMouseEvent | ReactTouchEvent;
  handleId: string | null;
  nodeId: string;
  onConnect: (connection: Connection) => void;
  isTarget: boolean;
  getState: StoreApi<ReactFlowState>["getState"];
  setState: StoreApi<ReactFlowState>["setState"];
  isValidConnection: ValidConnectionFunc;
  edgeUpdaterType?: HandleType;
  onReconnectEnd?: (evt: MouseEvent | TouchEvent) => void;
}): void {
  const doc = getHostForElement(event.target as HTMLElement);
  const {
    connectionMode,
    domNode,
    autoPanOnConnect,
    connectionRadius,
    panBy,
    cancelConnection,
  } = getState();
  let autoPanId = 0;
  let closestHandle: ConnectionHandle | null = null;

  const { x, y } = getEventPosition(event);
  const clickedHandle = doc?.elementFromPoint(x, y);
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
  const shouldFilterByAgentic = handleId !== null;
  const allowHandle = shouldFilterByAgentic
    ? (handle: Pick<ConnectionHandle, "portId" | "type">) => {
        return canConnectHandleFamilies(handleId, handle.portId);
      }
    : null;

  const autoPan = (): void => {
    if (!autoPanOnConnect) {
      return;
    }
    const [xMovement, yMovement] = calcAutoPan(
      connectionPosition,
      containerBounds,
    );

    panBy({ x: xMovement, y: yMovement });
    autoPanId = requestAnimationFrame(autoPan);
  };

  setState({
    connectionPosition,
    connectionStatus: null,
    connectionStartHandle: {
      sectionId: nodeId,
      handleId,
      type: handleType,
    },
    connectionEndHandle: null,
  });

  function onPointerMove(event: MouseEvent | TouchEvent) {
    const { transform } = getState();

    connectionPosition = getEventPosition(event, containerBounds);

    const { handle, validHandleResult } = getClosestHandle(
      event,
      doc,
      pointToRendererPoint(connectionPosition, transform, false, [1, 1], true),
      connectionRadius,
      handleLookup,
      allowHandle,
      (handle) =>
        isValidHandle(
          handle,
          connectionMode,
          nodeId,
          handleId,
          isTarget ? "target" : "source",
          isValidConnection,
          doc,
        ),
    );

    closestHandle = handle;

    if (!autoPanStarted) {
      autoPan();
      autoPanStarted = true;
    }

    handleDomNode = validHandleResult.handleDomNode;
    connection = validHandleResult.connection;
    isValid = validHandleResult.isValid;

    setState({
      connectionPosition:
        closestHandle && isValid
          ? rendererPointToPoint(
              {
                x: closestHandle.x,
                y: closestHandle.y,
              },
              transform,
            )
          : connectionPosition,
      connectionStatus: getConnectionStatus(!!closestHandle, isValid),
      connectionEndHandle: validHandleResult.endHandle
        ? {
            sectionId: validHandleResult.endHandle.sectionId,
            handleId: validHandleResult.endHandle.handleId,
            type: validHandleResult.endHandle.type,
          }
        : null,
    });

    if (!closestHandle && !isValid && !handleDomNode) {
      return resetRecentHandle(prevActiveHandle);
    }

    if (connection?.source !== connection?.target && handleDomNode) {
      resetRecentHandle(prevActiveHandle);
      prevActiveHandle = handleDomNode;
      handleDomNode.classList.add(
        "connecting",
        "react-flow__handle-connecting",
      );
      handleDomNode.classList.toggle("valid", isValid);
      handleDomNode.classList.toggle("react-flow__handle-valid", isValid);
    }
  }

  function onPointerUp(event: MouseEvent | TouchEvent) {
    let resolvedClosestHandle = closestHandle;
    let resolvedConnection = connection;
    let resolvedIsValid = isValid;

    if (!resolvedClosestHandle && handleId?.includes("reverse")) {
      const { transform } = getState();
      const fallback = getClosestHandle(
        event,
        doc,
        pointToRendererPoint(
          getEventPosition(event, containerBounds),
          transform,
          false,
          [1, 1],
          true,
        ),
        Math.max(connectionRadius, 80),
        handleLookup,
        allowHandle,
        (handle) =>
          isValidHandle(
            handle,
            connectionMode,
            nodeId,
            handleId,
            isTarget ? "target" : "source",
            isValidConnection,
            doc,
          ),
      );
      resolvedClosestHandle = fallback.handle;
      resolvedConnection = fallback.validHandleResult.connection;
      resolvedIsValid = fallback.validHandleResult.isValid;
    }
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

    resetRecentHandle(prevActiveHandle);
    cancelConnection();
    cancelAnimationFrame(autoPanId);
    autoPanStarted = false;
    isValid = false;
    connection = null;
    handleDomNode = null;

    doc.removeEventListener("mousemove", onPointerMove as EventListener);
    doc.removeEventListener("mouseup", onPointerUp as EventListener);

    doc.removeEventListener("touchmove", onPointerMove as EventListener);
    doc.removeEventListener("touchend", onPointerUp as EventListener);
  }

  doc.addEventListener("mousemove", onPointerMove as EventListener);
  doc.addEventListener("mouseup", onPointerUp as EventListener);

  doc.addEventListener("touchmove", onPointerMove as EventListener);
  doc.addEventListener("touchend", onPointerUp as EventListener);
}
