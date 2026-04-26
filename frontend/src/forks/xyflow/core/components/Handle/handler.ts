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
  HANDLE_CONNECTING_CLASS_NAME,
  HANDLE_VALID_CLASS_NAME,
} from "./classes";
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
  const eventHandle =
    event.currentTarget instanceof Element ? event.currentTarget : null;
  const handleElement = getHandleType(edgeUpdaterType, clickedHandle)
    ? clickedHandle
    : eventHandle;
  const handleType = getHandleType(edgeUpdaterType, handleElement);
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
    transform,
  }: {
    event: MouseEvent | TouchEvent;
    position: { x: number; y: number };
    radius: number;
    transform: ReactFlowState["transform"];
  }) =>
    getClosestHandle({
      event,
      doc,
      pos: pointToRendererPoint(position, transform, false, [1, 1], true),
      connectionRadius: radius,
      handles: handleLookup,
      allowHandle,
      validator: validateHandle,
    });

  const autoPan = (): void => {
    if (!autoPanOnConnect) {
      return;
    }
    const [xMovement = 0, yMovement = 0] = calcAutoPan(
      connectionPosition,
      containerBounds,
    );

    panBy({ x: xMovement, y: yMovement });
    autoPanId = requestAnimationFrame(autoPan);
  };

  const setConnectionPreview = ({
    transform,
    nextClosestHandle,
    nextIsValid,
    endHandle,
  }: {
    transform: ReactFlowState["transform"];
    nextClosestHandle: ConnectionHandle | null;
    nextIsValid: boolean;
    endHandle: ReactFlowState["connectionEndHandle"];
  }) => {
    const nextConnectionPosition =
      nextClosestHandle && nextIsValid
        ? rendererPointToPoint(
            {
              x: nextClosestHandle.x,
              y: nextClosestHandle.y,
            },
            transform,
          )
        : connectionPosition;

    setState({
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
    nextHandleDomNode.classList.add("connecting", HANDLE_CONNECTING_CLASS_NAME);
    nextHandleDomNode.classList.toggle("valid", nextIsValid);
    nextHandleDomNode.classList.toggle(HANDLE_VALID_CLASS_NAME, nextIsValid);
  };

  const resolvePointerUpState = (
    event: MouseEvent | TouchEvent,
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

    const { transform } = getState();
    const fallback = getClosestHandleForEvent({
      event,
      position: getEventPosition(event, containerBounds),
      radius: Math.max(connectionRadius, 80),
      transform,
    });

    return {
      closestHandle: fallback.handle,
      connection: fallback.validHandleResult.connection,
      isValid: fallback.validHandleResult.isValid,
    };
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

    const { handle, validHandleResult } = getClosestHandleForEvent({
      event,
      position: connectionPosition,
      radius: connectionRadius,
      transform,
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
      transform,
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

  function onPointerUp(event: MouseEvent | TouchEvent) {
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
