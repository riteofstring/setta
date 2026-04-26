import { useNodeId } from "forks/xyflow/core/contexts/NodeIdContext";
import type { HTMLAttributes } from "react";
import { memo, useLayoutEffect, useRef } from "react";
import {
  registerEdgeHandle,
  unregisterEdgeHandle,
  updateEdgeHandlePosition,
} from "state/actions/edgeHandles";
import { useReactFlow } from "../../store";
import type { Connection, HandleProps } from "../../types";
import { isMouseEvent } from "../../utils";
import { HANDLE_CLASS_NAME, getHandlePositionClassName } from "./classes";
import { handlePointerDown } from "./handler";

type HandleComponentProps = HandleProps &
  Omit<HTMLAttributes<HTMLDivElement>, "id">;
type HandlePointerEvent =
  | React.MouseEvent<HTMLDivElement>
  | React.TouchEvent<HTMLDivElement>;

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
        getState: useReactFlow.getState,
        setState: useReactFlow.setState,
        isValidConnection: isValidConnection ?? alwaysValid,
      });
    }

    dispatchPointerStartEvent({ event, onMouseDown, onTouchStart });
  };

  const classes = [
    HANDLE_CLASS_NAME,
    getHandlePositionClassName(position),
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

export const Handle = memo(HandleComponent);
