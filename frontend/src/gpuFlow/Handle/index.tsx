import type {
  HTMLAttributes,
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import { memo, useLayoutEffect, useRef } from "react";
import {
  registerEdgeHandle,
  unregisterEdgeHandle,
  updateEdgeHandlePosition,
} from "state/actions/edgeHandles";
import { useNodeId } from "../NodeIdContext";
import type { Connection, HandleProps } from "../flowTypes";
import { gpuFlowViewportStore } from "../viewportStore";
import { handlePointerDown } from "./handler";

type HandleComponentProps = HandleProps &
  Omit<HTMLAttributes<HTMLDivElement>, "id">;
type HandlePointerEvent =
  | ReactMouseEvent<HTMLDivElement>
  | ReactTouchEvent<HTMLDivElement>;

const alwaysValid = () => true;

function shouldStartHandleConnection({
  event,
  isConnectableStart,
}: {
  event: HandlePointerEvent;
  isConnectableStart: boolean;
}): boolean {
  if (!isConnectableStart) {
    return false;
  }

  return !isMouseEvent(event) || event.button === 0;
}

function dispatchPointerStartEvent({
  event,
  onMouseDown,
  onTouchStart,
}: {
  event: HandlePointerEvent;
  onMouseDown: HandleComponentProps["onMouseDown"];
  onTouchStart: HandleComponentProps["onTouchStart"];
}): void {
  if (isMouseEvent(event)) {
    onMouseDown?.(event);
    return;
  }

  onTouchStart?.(event);
}

function HandleComponent({
  type,
  position,
  isConnectable = true,
  isConnectableStart = true,
  isConnectableEnd = true,
  connectionStartSemanticType,
  id,
  isValidConnection,
  onConnect,
  className,
  onMouseDown,
  onTouchStart,
  ...rest
}: HandleComponentProps) {
  const handleRef = useRef<HTMLDivElement>(null);
  const nodeId = useNodeId();
  const handleId = id ?? null;

  useLayoutEffect(() => {
    if (!nodeId || !handleId) {
      return;
    }
    const key = registerEdgeHandle({
      sectionId: nodeId,
      portId: handleId,
      type,
      side: position,
      element: handleRef.current,
    });
    updateEdgeHandlePosition(key);
    const element = handleRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return () => unregisterEdgeHandle(nodeId, handleId, type);
    }
    const observer = new ResizeObserver(() => {
      updateEdgeHandlePosition(key);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      unregisterEdgeHandle(nodeId, handleId, type);
    };
  }, [nodeId, handleId, type, position]);

  const onConnectExtended = (params: Connection) => {
    onConnect?.(params);
  };

  const onPointerDown = (event: HandlePointerEvent) => {
    if (!nodeId || !handleId) {
      return;
    }

    if (shouldStartHandleConnection({ event, isConnectableStart })) {
      handlePointerDown({
        event,
        handleId,
        nodeId,
        onConnect: onConnectExtended,
        isTarget: (connectionStartSemanticType ?? type) === "target",
        store: gpuFlowViewportStore,
        isValidConnection: isValidConnection ?? alwaysValid,
      });
    }

    dispatchPointerStartEvent({ event, onMouseDown, onTouchStart });
  };

  const classes = [
    "react-flow__handle",
    `react-flow__handle-${position}`,
    "nodrag",
    className,
    type,
    isConnectable ? "connectable connectionindicator" : null,
    isConnectableStart ? "connectablestart" : null,
    isConnectableEnd ? "connectableend" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      data-handleid={handleId}
      data-nodeid={nodeId}
      data-handlepos={position}
      data-id={`${nodeId}-${handleId}-${type}`}
      className={classes}
      onMouseDown={onPointerDown}
      onTouchStart={onPointerDown}
      ref={handleRef}
      {...rest}
    />
  );
}

function isMouseEvent(
  event: HandlePointerEvent,
): event is ReactMouseEvent<HTMLDivElement> {
  return "button" in event;
}

export const Handle = memo(HandleComponent);
