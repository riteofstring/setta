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
import { handlePointerDown } from "./handler";

type HandleComponentProps = HandleProps &
  Omit<HTMLAttributes<HTMLDivElement>, "id">;

const alwaysValid = () => true;

function HandleComponent({
  type,
  position,
  isConnectable = true,
  isConnectableStart = true,
  isConnectableEnd = true,
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

  const onPointerDown = (
    event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
  ) => {
    if (!nodeId || !handleId) {
      return;
    }

    const isMouseTriggered = isMouseEvent(event);
    if (isConnectableStart && (!isMouseTriggered || event.button === 0)) {
      handlePointerDown({
        event,
        handleId,
        nodeId,
        onConnect: onConnectExtended,
        isTarget: type === "target",
        getState: useReactFlow.getState,
        setState: useReactFlow.setState,
        isValidConnection: isValidConnection ?? alwaysValid,
      });
    }

    if (isMouseTriggered) {
      onMouseDown?.(event);
    } else {
      onTouchStart?.(event);
    }
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

export const Handle = memo(HandleComponent);
