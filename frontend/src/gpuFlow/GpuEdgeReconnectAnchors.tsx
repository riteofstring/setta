import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";
import type { Connection } from "./flowTypes";
import { handlePointerDown } from "./Handle/handler";
import type { ValidConnectionFunc } from "./Handle/utils";
import type { GpuEdgeReconnectAnchor } from "./edges/edgeSources";
import { normalizeGpuViewport, type GpuViewportInput } from "./viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "./viewportStore";

export type GpuEdgeReconnectOptions = {
  readonly disabled?: boolean | (() => boolean) | undefined;
  readonly isValidConnection?: ValidConnectionFunc | undefined;
  readonly onReconnect: (edgeId: string, connection: Connection) => void;
  readonly store?: GpuFlowViewportStoreApi | undefined;
};

type EdgeReconnectPointerEvent =
  | ReactMouseEvent<HTMLDivElement>
  | ReactTouchEvent<HTMLDivElement>;

const alwaysValidConnection: ValidConnectionFunc = () => true;

export function GpuEdgeReconnectAnchorLayer({
  anchors,
  options,
  viewport,
}: {
  readonly anchors: readonly GpuEdgeReconnectAnchor[];
  readonly options: GpuEdgeReconnectOptions;
  readonly viewport: GpuViewportInput;
}) {
  if (anchors.length === 0) {
    return null;
  }
  return (
    <div
      className="setta-gpu-flow__edge-reconnect-layer"
      data-gpu-flow-edge-reconnect-layer="true"
      style={getGpuEdgeReconnectAnchorLayerStyle(viewport)}
    >
      {anchors.map((anchor) => (
        <GpuEdgeReconnectAnchorElement
          anchor={anchor}
          key={anchor.id}
          options={options}
        />
      ))}
    </div>
  );
}

export function getGpuEdgeReconnectAnchorLayerStyle(
  viewport: GpuViewportInput,
): CSSProperties {
  const normalized = normalizeGpuViewport(viewport);
  return {
    transform: `translate(${normalized.x}px, ${normalized.y}px) scale(${normalized.zoom})`,
  };
}

export function getGpuEdgeReconnectAnchorStyle(
  anchor: GpuEdgeReconnectAnchor,
): CSSProperties {
  return {
    height: anchor.radius * 2,
    transform: `translate(${anchor.x - anchor.radius}px, ${anchor.y - anchor.radius}px)`,
    width: anchor.radius * 2,
    zIndex: anchor.zIndex,
  };
}

function GpuEdgeReconnectAnchorElement({
  anchor,
  options,
}: {
  readonly anchor: GpuEdgeReconnectAnchor;
  readonly options: GpuEdgeReconnectOptions;
}) {
  const onPointerStart = (event: EdgeReconnectPointerEvent) => {
    if (isGpuEdgeReconnectDisabled(options.disabled)) {
      return;
    }
    if (isReactMouseEvent(event) && event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    handlePointerDown({
      edgeUpdaterType: anchor.fixedHandleType,
      event,
      handleId: anchor.fixedHandleId,
      isTarget: anchor.fixedIsTarget,
      isValidConnection:
        options.isValidConnection ?? alwaysValidConnection,
      nodeId: anchor.fixedSectionId,
      onConnect: (connection) => {
        options.onReconnect(anchor.edgeId, connection);
      },
      store: options.store ?? gpuFlowViewportStore,
    });
  };

  return (
    <div
      aria-hidden="true"
      className={[
        "setta-gpu-flow__edge-reconnect-anchor",
        "react-flow__edgeupdater",
        `react-flow__edgeupdater-${anchor.endpoint}`,
        NO_DRAG_CLASS_NAME,
        NO_PAN_CLASS_NAME,
      ].join(" ")}
      data-edge-endpoint={anchor.endpoint}
      data-edgeid={anchor.edgeId}
      data-gpu-flow-edge-reconnect-anchor="true"
      data-testid={`gpu-edge-reconnect-anchor-${anchor.id}`}
      onMouseDown={onPointerStart}
      onTouchStart={onPointerStart}
      style={getGpuEdgeReconnectAnchorStyle(anchor)}
    />
  );
}

function isGpuEdgeReconnectDisabled(
  disabled: boolean | (() => boolean) | undefined,
): boolean {
  return typeof disabled === "function" ? disabled() : Boolean(disabled);
}

function isReactMouseEvent(
  event: EdgeReconnectPointerEvent,
): event is ReactMouseEvent<HTMLDivElement> {
  return "button" in event;
}
