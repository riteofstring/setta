import type {
  HTMLAttributes,
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import { memo, useLayoutEffect, useRef } from "react";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";
import type { Connection, HandleProps } from "../flowTypes";
import {
  getGpuFlowHandlePositionClass,
  GPU_FLOW_CLASS_NAMES,
} from "../gpuFlowDomClasses";
import { useGpuFlowLayoutStoreContext } from "../layoutStoreContext";
import { useNodeId } from "../NodeIdContext";
import {
  measureGpuFlowPortElementLocalRect,
  registerGpuFlowPortDescriptor,
  unregisterGpuFlowPortDescriptor,
  updateGpuFlowPortDescriptorLocalRect,
} from "../ports/portGeometry";
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
  const layoutStore = useGpuFlowLayoutStoreContext();
  const nodeId = useNodeId();
  const handleId = id ?? null;

  useLayoutEffect(() => {
    if (!nodeId || !handleId) {
      return;
    }
    const element = handleRef.current;
    if (!element) {
      return;
    }
    const localRect = measureGpuFlowPortElementLocalRect(element);
    if (!localRect) {
      return;
    }
    const key = registerGpuFlowPortDescriptor({
      element,
      isConnectableEnd: isConnectable && isConnectableEnd,
      isConnectableStart: isConnectable && isConnectableStart,
      localRect,
      nodeId,
      portId: handleId,
      side: position,
      type,
    });
    if (typeof ResizeObserver === "undefined") {
      return () => unregisterGpuFlowPortDescriptor(nodeId, handleId, type);
    }
    const observer = new ResizeObserver(() => {
      const nextLocalRect = measureGpuFlowPortElementLocalRect(element);
      if (nextLocalRect) {
        updateGpuFlowPortDescriptorLocalRect(key, nextLocalRect);
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      unregisterGpuFlowPortDescriptor(nodeId, handleId, type);
    };
  }, [
    nodeId,
    handleId,
    type,
    position,
    isConnectable,
    isConnectableStart,
    isConnectableEnd,
  ]);

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
        layoutStore,
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
    GPU_FLOW_CLASS_NAMES.handle,
    getGpuFlowHandlePositionClass(position),
    NO_DRAG_CLASS_NAME,
    NO_PAN_CLASS_NAME,
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
